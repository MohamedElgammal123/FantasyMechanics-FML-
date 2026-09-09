-- ============================================================
-- 0013: consent at first sign-in + server-side email-domain
-- enforcement. (Completion run, 2026-08-23.)
--
-- 1. `profiles.consent_at` — stamped inside link_user_on_first_login
--    at the moment a profile is created via a consented first
--    sign-in. NULLABLE BY DESIGN and existing profiles are NOT
--    backfilled: consent_at records a real event (this person saw
--    the consent screen and agreed), and fabricating that for
--    profiles that predate the screen would make the column
--    meaningless as a record. Returning users (profile already
--    exists) never see the consent screen and are never re-gated —
--    a NULL consent_at on a pre-0013 profile is expected and fine.
--
-- 2. link_user_on_first_login gains `p_consent boolean`:
--    - profile already exists  -> already_linked (+ the 0005 sweep),
--      consent irrelevant.
--    - no profile yet          -> the WHOLE first-login body (both
--      creation paths AND the unlinked_signins audit insert) is
--      gated: p_consent must be exactly true or the function
--      returns {status:'consent_required'} having written NOTHING.
--      Declining therefore leaves zero app rows behind, and the
--      manual-CCID retry path is covered automatically (it re-enters
--      this same function with the same gate).
--
-- 3. Domain enforcement, server-side: before the consent gate, a
--    no-profile caller whose auth email does not end in
--    '@ualberta.ca' gets {status:'wrong_domain'} and no writes.
--    This closes the gap found on 2026-08-23 (see NIGHTLOG): the
--    @ualberta.ca restriction previously lived ONLY in
--    src/context/AuthContext.jsx — a direct RPC call from any
--    authenticated session (e.g. a gmail OAuth user, if the
--    provider config ever allowed one) could have created a
--    profile. The SQL predicate `lower(email) like '%@ualberta.ca'`
--    deliberately mirrors the client's isAllowedEmail() endsWith
--    check (src/engine/auth.js) — both reject subdomain lookalikes
--    like '@gmx.ualberta.ca' and suffix lookalikes like
--    '@notualberta.ca'. No dev exceptions: every tester is
--    @ualberta.ca.
--
-- The old single-parameter signature is DROPPED (not overloaded):
-- PostgREST resolves rpc calls by name+args and a leftover
-- (text)-only overload would both dodge the gate and make the call
-- ambiguous.
-- ============================================================

alter table profiles add column consent_at timestamptz;

drop function link_user_on_first_login(text);

create function link_user_on_first_login(p_ccid_override text default null, p_consent boolean default false)
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
  -- ccid before returning idempotently. Consent is not re-checked —
  -- returning users never see the consent screen.
  select * into v_profile from profiles where id = v_uid;
  if found then
    perform sweep_pending_enrollments(v_uid, v_profile.ccid, v_profile.id);
    return jsonb_build_object('status', 'already_linked', 'profile', to_jsonb(v_profile));
  end if;

  select email into v_email from auth.users where id = v_uid;

  -- Server-side domain gate (0013): no profile may ever be created
  -- for a non-@ualberta.ca account, regardless of what the client
  -- checked. Mirrors isAllowedEmail() in src/engine/auth.js.
  if v_email is null or lower(v_email) not like '%@ualberta.ca' then
    return jsonb_build_object('status', 'wrong_domain', 'profile', null);
  end if;

  -- Consent gate (0013): nothing below this line runs — no profile,
  -- no enrollment, not even the unlinked_signins audit insert —
  -- until the caller has explicitly consented.
  if p_consent is distinct from true then
    return jsonb_build_object('status', 'consent_required', 'profile', null);
  end if;

  -- Instructor/admin path: matched on email, no ccid override involved.
  select * into v_instructor_staging
  from pending_instructors
  where email = lower(trim(v_email)) and consumed_at is null
  limit 1;

  if found then
    insert into profiles (id, full_name, ccid, role, consent_at)
    values (
      v_uid,
      v_instructor_staging.full_name,
      lower(trim(split_part(v_email, '@', 1))),
      v_instructor_staging.role,
      now()
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

  insert into profiles (id, full_name, ccid, role, consent_at)
  values (v_uid, v_staging.full_name, v_staging.ccid, v_staging.role, now())
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

grant execute on function link_user_on_first_login(text, boolean) to authenticated;
