-- ============================================================
-- Fantasy Mechanics League — initial schema (v1.1)
-- Implements docs/fml_data_model.md exactly. Point rules are data.
-- point_events is an append-only ledger: no UPDATE/DELETE, ever.
-- ============================================================

-- ---------- enums ----------
create type user_role as enum ('student', 'instructor', 'admin');
create type activity_category as enum ('individual', 'large_scale');
create type scoring_mode as enum ('claim', 'ranked_upload');
create type result_source as enum ('wuclap', 'game_upload', 'game_api');
create type result_status as enum ('parsed', 'posted', 'voided');
create type point_source_kind as enum ('result_set', 'claim', 'adjustment');
create type claim_status as enum ('pending', 'approved', 'rejected');
create type team_status as enum ('forming', 'locked', 'auto_grouped', 'incomplete');
create type invite_status as enum ('pending', 'accepted', 'declined', 'expired', 'cancelled');
create type team_scoring as enum ('from_unlock', 'full_season');
create type prize_scope as enum ('team', 'individual');
create type escalation_scope as enum ('per_lecture');

-- ---------- identity & structure ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  ccid text unique not null,
  role user_role not null default 'student',
  created_at timestamptz not null default now()
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- 'ENGG 130'
  name text not null                  -- 'Engineering Mechanics'
);

create table terms (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- 'Winter 2027'
  season_label text not null,         -- 'SEASON 2027'
  week1_start date not null,
  weeks_total int not null check (weeks_total between 1 and 20)
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id),
  term_id uuid not null references terms(id),
  code text not null,                 -- 'EB1'
  instructor_id uuid not null references profiles(id),
  team_unlock_week int,               -- null = team mode off
  team_formation_deadline timestamptz,
  team_size int not null default 3 check (team_size between 2 and 6),
  team_scoring_mode team_scoring not null default 'from_unlock',
  weekly_claim_cap int check (weekly_claim_cap > 0),  -- null = uncapped
  unique (course_id, term_id, code)
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  student_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (section_id, student_id)
);
-- "one section per student per course-term" enforced by trigger below.

create or replace function enforce_one_section_per_course_term()
returns trigger language plpgsql as $$
declare v_course uuid; v_term uuid; v_count int;
begin
  select course_id, term_id into v_course, v_term from sections where id = new.section_id;
  select count(*) into v_count
  from enrollments e join sections s on s.id = e.section_id
  where e.student_id = new.student_id
    and s.course_id = v_course and s.term_id = v_term
    and e.section_id <> new.section_id;
  if v_count > 0 then
    raise exception 'Student already enrolled in a section of this course this term';
  end if;
  return new;
end $$;

create trigger trg_one_section_per_course_term
  before insert on enrollments
  for each row execute function enforce_one_section_per_course_term();

-- ---------- activities & payout curves ----------
create table activity_types (
  id text primary key,                -- 'discussion', 'wuclap', 'game', ...
  label text not null,
  category activity_category not null,
  scoring scoring_mode not null
);

insert into activity_types (id, label, category, scoring) values
  ('discussion',        'Discussion',            'individual',  'claim'),
  ('correct_mistakes',  'Correct-the-Mistakes',  'individual',  'claim'),
  ('act_as_professor',  'Act-as-Professor',      'individual',  'claim'),
  ('demo',              'Demos',                 'individual',  'claim'),
  ('wuclap',            'WuClap',                'large_scale', 'ranked_upload'),
  ('game',              'Games',                 'large_scale', 'ranked_upload');

create table payout_curves (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  name text not null,
  top_points int not null check (top_points > 0),
  step int not null default 1 check (step >= 0),
  ranked_cutoff int not null check (ranked_cutoff > 0),
  participation_floor int not null default 1 check (participation_floor >= 0),
  is_wuclap_default boolean not null default false,
  -- lowest curve payout must not undercut the floor:
  check (top_points - (ranked_cutoff - 1) * step >= participation_floor)
);

-- exactly one wuclap default per section
create unique index uq_wuclap_default_per_section
  on payout_curves (section_id) where is_wuclap_default;

-- ---------- games ----------
create table games (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  title text not null,
  blurb text,
  matchday int not null,
  thumbnail_url text,
  launch_url text not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null check (closes_at > opens_at),
  payout_curve_id uuid not null references payout_curves(id)
);

create table game_launches (
  student_id uuid not null references profiles(id),
  game_id uuid not null references games(id) on delete cascade,
  launched_at timestamptz not null default now(),
  primary key (student_id, game_id)
);

-- ---------- results ingestion ----------
create table result_sets (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  source result_source not null,
  game_id uuid references games(id),
  label text not null,                -- 'Lecture 18'
  payout_curve_id uuid not null references payout_curves(id),
  uploaded_by uuid not null references profiles(id),
  uploaded_at timestamptz not null default now(),
  file_name text,
  status result_status not null default 'parsed',
  check (source = 'wuclap' or game_id is not null)
);

create table result_rows (
  id uuid primary key default gen_random_uuid(),
  result_set_id uuid not null references result_sets(id) on delete cascade,
  ccid text not null,
  student_id uuid references profiles(id),  -- null = unmatched, fix in UI
  rank int check (rank > 0),                -- null = participated, unranked
  raw_score numeric
);

-- ---------- points ledger (append-only) ----------
create table point_events (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  student_id uuid not null references profiles(id),
  activity_type_id text not null references activity_types(id),
  points int not null,                -- negative only via voids/adjustments
  source_kind point_source_kind not null,
  source_id uuid,                     -- result_sets.id or claims.id
  reason text,                        -- required for adjustments (app-enforced)
  occurred_at timestamptz not null default now(),
  week_number int not null
);

create index idx_pe_section_student on point_events (section_id, student_id);
create index idx_pe_section_week on point_events (section_id, week_number);

-- Ledger immutability: block UPDATE and DELETE at the database level.
create or replace function forbid_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'point_events is append-only; post a compensating event instead';
end $$;

create trigger trg_pe_no_update before update on point_events
  for each row execute function forbid_ledger_mutation();
create trigger trg_pe_no_delete before delete on point_events
  for each row execute function forbid_ledger_mutation();

-- week number helper (used by posting functions)
create or replace function week_number_for(p_section uuid, p_at timestamptz)
returns int language sql stable as $$
  select greatest(1, least(t.weeks_total,
    (floor(extract(epoch from (p_at - t.week1_start::timestamptz)) / 604800))::int + 1))
  from sections s join terms t on t.id = s.term_id
  where s.id = p_section
$$;

-- ---------- weekly rank snapshots ----------
create table rank_snapshots (
  section_id uuid not null references sections(id) on delete cascade,
  student_id uuid not null references profiles(id),
  week_number int not null,
  rank int not null,
  total_points int not null,
  primary key (section_id, student_id, week_number)
);

-- ---------- claims ----------
create table claim_rules (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  activity_type_id text not null references activity_types(id),
  base_points int not null check (base_points > 0),
  escalation_step int not null default 0 check (escalation_step >= 0),
  escalation_cap int check (escalation_cap >= 1),
  escalation_scope escalation_scope not null default 'per_lecture',
  unique (section_id, activity_type_id)
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  student_id uuid not null references profiles(id),
  activity_type_id text not null references activity_types(id),
  lecture_date date not null,
  description text not null,
  computed_points int not null,       -- from claim_rules at submission
  awarded_points int,                 -- instructor override; null = use computed
  status claim_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz
);

create index idx_claims_pending on claims (section_id) where status = 'pending';

-- ---------- bi-weekly cycles ----------
create table cycles (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  number int not null,
  week_start int not null,
  week_end int not null,
  finalized_at timestamptz,
  unique (section_id, number)
);

create table cycle_champions (
  cycle_id uuid not null references cycles(id) on delete cascade,
  student_id uuid not null references profiles(id),
  points int not null,
  primary key (cycle_id, student_id)
);

-- ---------- teams ----------
create table teams (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  name text not null,
  captain_id uuid not null references profiles(id),
  status team_status not null default 'forming',
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  student_id uuid not null references profiles(id),
  joined_at timestamptz not null default now(),
  primary key (team_id, student_id)
);

-- one team per student per section: enforced by trigger
create or replace function enforce_one_team_per_section()
returns trigger language plpgsql as $$
declare v_section uuid; v_count int;
begin
  select section_id into v_section from teams where id = new.team_id;
  select count(*) into v_count
  from team_members tm join teams t on t.id = tm.team_id
  where tm.student_id = new.student_id and t.section_id = v_section
    and tm.team_id <> new.team_id;
  if v_count > 0 then
    raise exception 'Student already belongs to a team in this section';
  end if;
  return new;
end $$;

create trigger trg_one_team_per_section
  before insert on team_members
  for each row execute function enforce_one_team_per_section();

create table team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  invitee_id uuid not null references profiles(id),
  status invite_status not null default 'pending',
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (team_id, invitee_id)
);

create table prize_tiers (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  scope prize_scope not null default 'team',
  name text not null,                 -- 'Bronze'
  threshold_points int not null check (threshold_points > 0),
  reward_text text not null
);

-- ---------- gradebook ----------
create table gradebook_uploads (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  uploaded_by uuid not null references profiles(id),
  uploaded_at timestamptz not null default now(),
  file_name text,
  is_baseline boolean not null default false   -- pre-FML historical cohort
);

create table gradebook_rows (
  id uuid primary key default gen_random_uuid(),
  gradebook_upload_id uuid not null references gradebook_uploads(id) on delete cascade,
  ccid text not null,
  student_id uuid references profiles(id),
  final_grade numeric,
  letter_grade text
);

-- ============================================================
-- Server-side posting functions (SECURITY DEFINER)
-- Clients NEVER write point_events directly.
-- ============================================================

-- Pure curve math, mirrored 1:1 in the JS engine + test harness.
create or replace function curve_points(
  p_rank int, p_top int, p_step int, p_cutoff int, p_floor int
) returns int language sql immutable as $$
  select case
    when p_rank is null then p_floor
    when p_rank <= p_cutoff then p_top - (p_rank - 1) * p_step
    else p_floor
  end
$$;

-- Post a parsed result set: emit events atomically, flip to 'posted'.
create or replace function post_result_set(p_result_set uuid)
returns int language plpgsql security definer as $$
declare
  rs record; c record; n int := 0;
begin
  select * into rs from result_sets where id = p_result_set for update;
  if rs is null then raise exception 'result set not found'; end if;
  if rs.status <> 'parsed' then raise exception 'result set is %, not parsed', rs.status; end if;

  select * into c from payout_curves where id = rs.payout_curve_id;

  insert into point_events
    (section_id, student_id, activity_type_id, points, source_kind, source_id, occurred_at, week_number)
  select
    rs.section_id,
    r.student_id,
    case when rs.source = 'wuclap' then 'wuclap' else 'game' end,
    curve_points(r.rank, c.top_points, c.step, c.ranked_cutoff, c.participation_floor),
    'result_set',
    rs.id,
    now(),
    week_number_for(rs.section_id, now())
  from result_rows r
  where r.result_set_id = rs.id and r.student_id is not null;

  get diagnostics n = row_count;
  update result_sets set status = 'posted' where id = rs.id;
  return n;
end $$;

-- Void a posted result set: compensating negative events (ledger stays append-only).
create or replace function void_result_set(p_result_set uuid)
returns int language plpgsql security definer as $$
declare rs record; n int := 0;
begin
  select * into rs from result_sets where id = p_result_set for update;
  if rs.status <> 'posted' then raise exception 'only posted sets can be voided'; end if;

  insert into point_events
    (section_id, student_id, activity_type_id, points, source_kind, source_id, reason, occurred_at, week_number)
  select section_id, student_id, activity_type_id, -points, 'adjustment', rs.id,
         'void of result set ' || rs.label, now(), week_number_for(rs.section_id, now())
  from point_events
  where source_kind = 'result_set' and source_id = rs.id;

  get diagnostics n = row_count;
  update result_sets set status = 'voided' where id = rs.id;
  return n;
end $$;

-- Approve a claim: emit event for awarded ?? computed points.
create or replace function approve_claim(p_claim uuid, p_reviewer uuid, p_override int default null)
returns void language plpgsql security definer as $$
declare cl record;
begin
  select * into cl from claims where id = p_claim for update;
  if cl.status <> 'pending' then raise exception 'claim is %, not pending', cl.status; end if;

  update claims set status = 'approved', awarded_points = p_override,
    reviewed_by = p_reviewer, reviewed_at = now() where id = p_claim;

  insert into point_events
    (section_id, student_id, activity_type_id, points, source_kind, source_id, occurred_at, week_number)
  values (cl.section_id, cl.student_id, cl.activity_type_id,
          coalesce(p_override, cl.computed_points), 'claim', cl.id,
          now(), week_number_for(cl.section_id, now()));
end $$;

-- Instructor ad-hoc grant ("claim 10 points"). Exempt from weekly cap.
create or replace function grant_points(
  p_section uuid, p_student uuid, p_points int, p_reason text, p_activity text default 'discussion'
) returns void language plpgsql security definer as $$
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required for instructor grants';
  end if;
  insert into point_events
    (section_id, student_id, activity_type_id, points, source_kind, reason, occurred_at, week_number)
  values (p_section, p_student, p_activity, p_points, 'adjustment', p_reason,
          now(), week_number_for(p_section, now()));
end $$;

-- ============================================================
-- Row-level security
-- ============================================================
alter table profiles enable row level security;
alter table enrollments enable row level security;
alter table sections enable row level security;
alter table payout_curves enable row level security;
alter table games enable row level security;
alter table game_launches enable row level security;
alter table result_sets enable row level security;
alter table result_rows enable row level security;
alter table point_events enable row level security;
alter table rank_snapshots enable row level security;
alter table claim_rules enable row level security;
alter table claims enable row level security;
alter table cycles enable row level security;
alter table cycle_champions enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table team_invites enable row level security;
alter table prize_tiers enable row level security;
alter table gradebook_uploads enable row level security;
alter table gradebook_rows enable row level security;

-- helper: is the current user enrolled in the section?
create or replace function is_enrolled(p_section uuid)
returns boolean language sql stable security definer as $$
  select exists (select 1 from enrollments where section_id = p_section and student_id = auth.uid())
$$;

-- helper: does the current user instruct the section?
create or replace function is_instructor_of(p_section uuid)
returns boolean language sql stable security definer as $$
  select exists (select 1 from sections where id = p_section and instructor_id = auth.uid())
$$;

-- profiles: read own; instructors read profiles of students in their sections
create policy p_profiles_self on profiles for select using (id = auth.uid());
create policy p_profiles_instructor on profiles for select using (
  exists (select 1 from enrollments e join sections s on s.id = e.section_id
          where e.student_id = profiles.id and s.instructor_id = auth.uid())
);
create policy p_profiles_section_peers on profiles for select using (
  -- students can see names of peers in their section (leaderboard, team search)
  exists (select 1 from enrollments e1 join enrollments e2 on e1.section_id = e2.section_id
          where e1.student_id = auth.uid() and e2.student_id = profiles.id)
);

-- sections: visible to their students and instructor; instructor updates own
create policy p_sections_read on sections for select
  using (is_enrolled(id) or instructor_id = auth.uid());
create policy p_sections_write on sections for update
  using (instructor_id = auth.uid());
create policy p_sections_insert on sections for insert
  with check (instructor_id = auth.uid());

-- enrollments: read within own section; instructor manages
create policy p_enroll_read on enrollments for select
  using (student_id = auth.uid() or is_enrolled(section_id) or is_instructor_of(section_id));
create policy p_enroll_write on enrollments for insert
  with check (is_instructor_of(section_id));

-- point_events: readable within section; NO insert/update/delete policies
-- (writes happen only through security-definer functions above)
create policy p_pe_read on point_events for select
  using (is_enrolled(section_id) or is_instructor_of(section_id));

-- rank snapshots, cycles, champions, prize tiers, games, curves: section read
create policy p_rs_read on rank_snapshots for select using (is_enrolled(section_id) or is_instructor_of(section_id));
create policy p_cy_read on cycles for select using (is_enrolled(section_id) or is_instructor_of(section_id));
create policy p_cc_read on cycle_champions for select using (
  exists (select 1 from cycles c where c.id = cycle_id and (is_enrolled(c.section_id) or is_instructor_of(c.section_id)))
);
create policy p_pt_read on prize_tiers for select using (is_enrolled(section_id) or is_instructor_of(section_id));
create policy p_g_read on games for select using (is_enrolled(section_id) or is_instructor_of(section_id));
create policy p_curves_read on payout_curves for select using (is_enrolled(section_id) or is_instructor_of(section_id));

-- instructor-managed config
create policy p_curves_write on payout_curves for all using (is_instructor_of(section_id)) with check (is_instructor_of(section_id));
create policy p_g_write on games for all using (is_instructor_of(section_id)) with check (is_instructor_of(section_id));
create policy p_pt_write on prize_tiers for all using (is_instructor_of(section_id)) with check (is_instructor_of(section_id));
create policy p_cr_read on claim_rules for select using (is_enrolled(section_id) or is_instructor_of(section_id));
create policy p_cr_write on claim_rules for all using (is_instructor_of(section_id)) with check (is_instructor_of(section_id));

-- game launches: student inserts own, reads own; instructor reads section's
create policy p_gl_ins on game_launches for insert with check (student_id = auth.uid());
create policy p_gl_read on game_launches for select using (
  student_id = auth.uid()
  or exists (select 1 from games g where g.id = game_id and is_instructor_of(g.section_id))
);

-- result sets/rows: instructor-only (raw scores are not student-visible)
create policy p_rsets on result_sets for all using (is_instructor_of(section_id)) with check (is_instructor_of(section_id));
create policy p_rrows on result_rows for all using (
  exists (select 1 from result_sets rs where rs.id = result_set_id and is_instructor_of(rs.section_id))
) with check (
  exists (select 1 from result_sets rs where rs.id = result_set_id and is_instructor_of(rs.section_id))
);

-- claims: student inserts/reads own; instructor reads/updates section's
create policy p_claims_student_ins on claims for insert with check (student_id = auth.uid() and is_enrolled(section_id));
create policy p_claims_student_read on claims for select using (student_id = auth.uid());
create policy p_claims_instructor on claims for select using (is_instructor_of(section_id));
create policy p_claims_instructor_upd on claims for update using (is_instructor_of(section_id));

-- teams: section-visible; captain manages own forming team; instructor manages all
create policy p_teams_read on teams for select using (is_enrolled(section_id) or is_instructor_of(section_id));
create policy p_teams_captain_ins on teams for insert with check (captain_id = auth.uid() and is_enrolled(section_id));
create policy p_teams_captain_upd on teams for update using (captain_id = auth.uid() and status = 'forming');
create policy p_teams_instructor on teams for update using (is_instructor_of(section_id));

create policy p_tm_read on team_members for select using (
  exists (select 1 from teams t where t.id = team_id and (is_enrolled(t.section_id) or is_instructor_of(t.section_id)))
);
create policy p_tm_write on team_members for insert with check (
  student_id = auth.uid()  -- joining via accepted invite; app verifies invite
  or exists (select 1 from teams t where t.id = team_id and is_instructor_of(t.section_id))
);

create policy p_ti_read on team_invites for select using (
  invitee_id = auth.uid()
  or exists (select 1 from teams t where t.id = team_id and (t.captain_id = auth.uid() or is_instructor_of(t.section_id)))
);
create policy p_ti_captain on team_invites for insert with check (
  exists (select 1 from teams t where t.id = team_id and t.captain_id = auth.uid() and t.status = 'forming')
);
create policy p_ti_respond on team_invites for update using (
  invitee_id = auth.uid()
  or exists (select 1 from teams t where t.id = team_id and t.captain_id = auth.uid())
);

-- gradebook: instructor-only, never student-visible
create policy p_gb on gradebook_uploads for all using (is_instructor_of(section_id)) with check (is_instructor_of(section_id));
create policy p_gbr on gradebook_rows for all using (
  exists (select 1 from gradebook_uploads g where g.id = gradebook_upload_id and is_instructor_of(g.section_id))
) with check (
  exists (select 1 from gradebook_uploads g where g.id = gradebook_upload_id and is_instructor_of(g.section_id))
);
