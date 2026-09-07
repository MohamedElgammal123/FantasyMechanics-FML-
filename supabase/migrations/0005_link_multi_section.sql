-- ============================================================
-- Fix: a student staged in pending_enrollments for two different
-- sections (e.g. taking two courses this term) only ever got
-- enrolled in one — link_user_on_first_login consumed at most one
-- staging row per call and returned early on the 'already_linked'
-- branch without checking for others. AuthContext already calls
-- this RPC on every login, so the fix lives entirely here: sweep
-- for any other unconsumed pending_enrollments rows matching this
-- profile's ccid, both right after first-ever linking and on every
-- subsequent already-linked login.
--
-- A row is left unconsumed (for the instructor to resolve by hand)
-- if enrolling would violate a constraint, e.g. the student is
-- already enrolled in another section of the same course/term.
-- ============================================================

create or replace function sweep_pending_enrollments(p_uid uuid, p_ccid text, p_profile_id uuid)
returns void language plpgsql security definer as $$
declare v_extra pending_enrollments%rowtype;
begin
  for v_extra in
    select * from pending_enrollments
    where ccid = p_ccid and consumed_at is null
    for update
  loop
    begin
      insert into enrollments (section_id, student_id) values (v_extra.section_id, p_uid);
      update pending_enrollments set consumed_at = now(), linked_profile_id = p_profile_id
      where id = v_extra.id;
    exception when others then
      null;
    end;
  end loop;
end $$;

create or replace function link_user_on_first_login(p_ccid_override text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_ccid text;
  v_instructor_staging pending_instructors%rowtype;
  v_staging pending_enrollments%rowtype;
  v_profile profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Already linked: sweep for any other sections staged under this
  -- ccid before returning idempotently.
  select * into v_profile from profiles where id = v_uid;
  if found then
    perform sweep_pending_enrollments(v_uid, v_profile.ccid, v_profile.id);
    return jsonb_build_object('status', 'already_linked', 'profile', to_jsonb(v_profile));
  end if;

  select email into v_email from auth.users where id = v_uid;

  -- Instructor/admin path: matched on email, no ccid override involved.
  select * into v_instructor_staging
  from pending_instructors
  where email = lower(trim(v_email)) and consumed_at is null
  limit 1;

  if found then
    insert into profiles (id, full_name, ccid, role)
    values (
      v_uid,
      v_instructor_staging.full_name,
      lower(trim(split_part(v_email, '@', 1))),
      v_instructor_staging.role
    )
    returning * into v_profile;

    update pending_instructors
    set consumed_at = now(), linked_profile_id = v_profile.id
    where id = v_instructor_staging.id;

    return jsonb_build_object('status', 'linked', 'profile', to_jsonb(v_profile));
  end if;

  -- Student path: matched on ccid.
  if p_ccid_override is not null then
    v_ccid := lower(trim(p_ccid_override));
  else
    v_ccid := lower(trim(split_part(v_email, '@', 1)));
  end if;

  select * into v_staging
  from pending_enrollments
  where ccid = v_ccid and consumed_at is null
  limit 1;

  if not found then
    if p_ccid_override is not null then
      insert into unlinked_signins (auth_user_id, email, attempted_ccid)
      values (v_uid, v_email, v_ccid);
      return jsonb_build_object('status', 'unlinked_recorded', 'profile', null);
    else
      return jsonb_build_object('status', 'no_match', 'profile', null);
    end if;
  end if;

  insert into profiles (id, full_name, ccid, role)
  values (v_uid, v_staging.full_name, v_staging.ccid, v_staging.role)
  returning * into v_profile;

  insert into enrollments (section_id, student_id)
  values (v_staging.section_id, v_uid);

  update pending_enrollments
  set consumed_at = now(), linked_profile_id = v_profile.id
  where id = v_staging.id;

  -- Same ccid may be staged in other sections too (multi-course this term).
  perform sweep_pending_enrollments(v_uid, v_staging.ccid, v_profile.id);

  return jsonb_build_object('status', 'linked', 'profile', to_jsonb(v_profile));
end;
$$;
