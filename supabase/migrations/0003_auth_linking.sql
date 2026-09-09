-- ============================================================
-- Auth linking: turn a pre-seeded roster row into a real profile
-- on a student's first login. profiles.id is a hard FK to
-- auth.users(id), so a profiles row cannot exist before the
-- student has signed in at least once — pending_enrollments is
-- the staging table instructors populate ahead of time.
--
-- Matching key is ccid (per docs/fml_data_model.md), derived from
-- the student's @ualberta.ca email local-part on first login.
-- Staging rows are never deleted (mark consumed_at instead) so
-- instructors can audit who has/hasn't logged in yet.
-- ============================================================

create table pending_enrollments (
  id uuid primary key default gen_random_uuid(),
  ccid text not null,                 -- normalized: lower(trim(...))
  full_name text not null,            -- "First Last"
  role user_role not null default 'student',
  section_id uuid not null references sections(id) on delete cascade,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  linked_profile_id uuid references profiles(id),
  unique (ccid, section_id)
);

create index idx_pending_enrollments_ccid_unconsumed
  on pending_enrollments (ccid)
  where consumed_at is null;

-- Instructor (and admin) onboarding follows the same staging pattern
-- as students, matched on email instead of ccid. Deliberately has no
-- insert/update policy for any authenticated role: a row here grants
-- instructor power over student data, so it can only be created via
-- the Supabase dashboard (service role) or a future admin screen —
-- never by a signed-in user, however trusted.
create table pending_instructors (
  id uuid primary key default gen_random_uuid(),
  email text not null,                -- normalized: lower(trim(...))
  full_name text not null,
  role user_role not null default 'instructor' check (role in ('instructor', 'admin')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  linked_profile_id uuid references profiles(id)
);

create unique index idx_pending_instructors_email_unconsumed
  on pending_instructors (email)
  where consumed_at is null;

-- Students who logged in but whose CCID (derived or manually entered)
-- never matched a staging row. Instructors resolve these by hand,
-- attaching them to the correct pending_enrollments row.
create table unlinked_signins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  attempted_ccid text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id),
  resolved_profile_id uuid references profiles(id)
);

alter table pending_enrollments enable row level security;
alter table pending_instructors enable row level security;
alter table unlinked_signins enable row level security;

-- Instructors can see roster-linking state for their own sections.
-- No client insert/update/delete policies: writes only happen via
-- the SECURITY DEFINER function below (or, later, the instructor
-- roster-upload flow in P6, which will get its own function).
create policy p_pending_enrollments_instructor_read on pending_enrollments
  for select using (
    exists (
      select 1 from sections s
      where s.id = pending_enrollments.section_id
        and s.instructor_id = auth.uid()
    )
  );

-- Admin-only visibility. No insert/update/delete policy for any
-- authenticated role — writes happen only via the Supabase dashboard
-- (service role) or a future admin screen.
create policy p_pending_instructors_admin_read on pending_instructors
  for select using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy p_unlinked_signins_instructor_read on unlinked_signins
  for select using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('instructor', 'admin')
    )
  );

-- ---------- linking function ----------
-- Called by the client right after a successful Supabase Auth
-- session is established. Idempotent: if the caller already has a
-- profile, it's returned as-is.
--
-- Checks pending_instructors (by email) first, then falls back to
-- pending_enrollments (by ccid) for students — instructor onboarding
-- uses the same "sign in through the same front door" pattern as
-- students, just matched on email since instructors aren't tied to a
-- roster row.
--
-- p_ccid_override is null on the first automatic student-path
-- attempt (CCID is derived from the @ualberta.ca email). If that
-- attempt finds no staging match, the client prompts the student to
-- type their CCID and calls this function again with p_ccid_override
-- set — a second miss on an explicit override is recorded as an
-- unlinked sign-in rather than retried further.
--
-- Returns a jsonb status: {status: 'linked'|'already_linked'|
--   'no_match'|'unlinked_recorded', profile: {...} | null}
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

  -- Already linked: idempotent return.
  select * into v_profile from profiles where id = v_uid;
  if found then
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

  return jsonb_build_object('status', 'linked', 'profile', to_jsonb(v_profile));
end;
$$;

grant execute on function link_user_on_first_login(text) to authenticated;
