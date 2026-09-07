-- ============================================================
-- P8 PARITY FIXTURE — FAKE DATA ONLY. Companion: fixture_wipe.sql
-- (run the wipe BEFORE any future seed_wipe.sql: fixture sections
-- have instructor_id = zseed99's profile, which seed_wipe deletes).
--
-- Run in the dashboard SQL editor (postgres role) AFTER seed.sql
-- and AFTER signing in as the zseed99 viewer at least once (the
-- fixture sections are owned by that profile so the parity harness,
-- authenticated as zseed99, can call run_section_maintenance and
-- read everything back under instructor RLS).
--
-- Markers, matching seed.sql discipline:
--   · fixed UUIDs prefixed 5eedc0de-0000-4000-B000-… (the b000 block
--     — distinct from seed.sql's a000 block, same 5eedc0de family)
--   · course codes 'ZPAR 901'/'ZPAR 902', terms 'Parity Term …(dev)'
--   · reuses seed.sql's zseed01–zseed10 student profiles; creates NO
--     auth users and NO profiles of its own
--
-- Two sections:
--   PA1 — ledger parity (co-champion tie, in-window void, late void)
--         + the approved Table D formation scenario, deadline passed.
--         week1_start = Monday 4 weeks ago → weeks 1–4 complete,
--         cycles (1–2) and (3–4) due, (5–6) not.
--   PB1 — degenerate: zero enrollments, zero events, no deadline.
--         Both cycles due → must finalize with ZERO champion rows
--         (approved D4) and produce ZERO snapshot rows.
--
-- The formation pre-state below is mirrored verbatim in
-- tests/parity/parity.mjs (PRE_STATE) — keep the two in sync.
-- ============================================================

do $$
declare
  v_viewer uuid;                       -- zseed99's profile (fixture instructor)
  v_sid uuid[];                        -- seed student uuids by index 1..10
  v_week1 date := (date_trunc('week', now()) - interval '4 weeks')::date;

  c_course_a uuid := '5eedc0de-0000-4000-b000-00000000c001';
  c_term_a   uuid := '5eedc0de-0000-4000-b000-000000007e01';
  c_sect_a   uuid := '5eedc0de-0000-4000-b000-000000005ec1';
  c_course_b uuid := '5eedc0de-0000-4000-b000-00000000c002';
  c_term_b   uuid := '5eedc0de-0000-4000-b000-000000007e02';
  c_sect_b   uuid := '5eedc0de-0000-4000-b000-000000005ec2';
  c_team_a   uuid := '5eedc0de-0000-4000-b000-000000000701';  -- Alpha (parity)
  c_team_b   uuid := '5eedc0de-0000-4000-b000-000000000702';  -- Bravo (parity)
begin
  -- ---- tripwires ----
  if exists (select 1 from courses where id = c_course_a) then
    raise exception 'PARITY FIXTURE ABORTED: already applied — run fixture_wipe.sql first';
  end if;
  select id into v_viewer from profiles where ccid = 'zseed99';
  if v_viewer is null then
    raise exception 'PARITY FIXTURE ABORTED: no zseed99 profile — sign in as the seed viewer first';
  end if;
  select array_agg(('5eedc0de-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid order by n)
    into v_sid from generate_series(1, 10) n;
  if not exists (select 1 from profiles where id = v_sid[1]) then
    raise exception 'PARITY FIXTURE ABORTED: seed students missing — run seed.sql first';
  end if;

  -- ---- fixture A: ledger + formation ----
  insert into courses (id, code, name)
  values (c_course_a, 'ZPAR 901', 'Parity Fixture A (dev)');
  insert into terms (id, name, season_label, week1_start, weeks_total)
  values (c_term_a, 'Parity Term A (dev)', 'PARITY DEV', v_week1, 6);
  insert into sections (id, course_id, term_id, code, instructor_id,
                        team_unlock_week, team_formation_deadline, team_size,
                        team_scoring_mode, weekly_claim_cap)
  values (c_sect_a, c_course_a, c_term_a, 'PA1', v_viewer,
          4, now() - interval '1 day', 3, 'from_unlock', null);

  insert into enrollments (section_id, student_id)
  select c_sect_a, v_sid[n] from generate_series(1, 10) n;

  -- Ledger (adjustment-shaped, the same shape grant_points emits).
  -- Weeks 1–2 = cycle 1: s1 12+8 = 20; s2 25−5 = 20 (in-window void
  -- nets out) → co-champion tie at 20; s3 15 → rank 3.
  -- Weeks 3–4 = cycle 2: s2 +20, s4 +9, s5 +7, and s1 −10 — a LATE
  -- void of a week-1 event, posted in week 3, so it must appear in
  -- cycle-2 standings and in snapshots W>=3 but never in W1/W2.
  insert into point_events (section_id, student_id, activity_type_id, points,
                            source_kind, reason, occurred_at, week_number)
  select c_sect_a, v_sid[v.i], 'discussion', v.pts, 'adjustment', v.why,
         v_week1::timestamptz + make_interval(weeks => v.w - 1, days => 2, hours => 18), v.w
  from (values
    (1, 1,  12, 'Parity fixture (dev)'),
    (1, 2,   8, 'Parity fixture (dev)'),
    (2, 1,  25, 'Parity fixture (dev)'),
    (2, 2,  -5, 'Parity fixture (dev): in-window void'),
    (3, 2,  15, 'Parity fixture (dev)'),
    (2, 3,  20, 'Parity fixture (dev)'),
    (1, 3, -10, 'Parity fixture (dev): late void of a week-1 event'),
    (4, 3,   9, 'Parity fixture (dev)'),
    (5, 4,   7, 'Parity fixture (dev)')
  ) v(i, w, pts, why);

  -- Formation pre-state (approved Table D; mirrored in parity.mjs):
  -- Alpha full at 3/3 → must lock; Bravo 2/3 → must fill with zseed06
  -- (ccid order) keeping name+captain; pool remainder → 'Team 3'
  -- {07,08,09} auto_grouped + 'Team 4' {10} incomplete.
  insert into teams (id, section_id, name, captain_id, status, created_at)
  values
    (c_team_a, c_sect_a, 'Alpha (parity)', v_sid[1], 'forming', now() - interval '2 days'),
    (c_team_b, c_sect_a, 'Bravo (parity)', v_sid[4], 'forming', now() - interval '2 days' + interval '1 hour');

  insert into team_members (team_id, student_id)
  values (c_team_a, v_sid[1]), (c_team_a, v_sid[2]), (c_team_a, v_sid[3]),
         (c_team_b, v_sid[4]), (c_team_b, v_sid[5]);

  insert into team_invites (id, team_id, invitee_id, status, sent_at, responded_at)
  values
    ('5eedc0de-0000-4000-b000-000000000801', c_team_a, v_sid[3], 'accepted',
     now() - interval '2 days', now() - interval '1 day 12 hours'),
    ('5eedc0de-0000-4000-b000-000000000802', c_team_b, v_sid[6], 'pending',
     now() - interval '2 days', null),
    ('5eedc0de-0000-4000-b000-000000000803', c_team_b, v_sid[7], 'declined',
     now() - interval '2 days', now() - interval '1 day 12 hours'),
    ('5eedc0de-0000-4000-b000-000000000804', c_team_b, v_sid[8], 'cancelled',
     now() - interval '2 days', now() - interval '1 day 18 hours');

  -- ---- fixture B: zero events, both cycles due, no deadline ----
  insert into courses (id, code, name)
  values (c_course_b, 'ZPAR 902', 'Parity Fixture B (dev)');
  insert into terms (id, name, season_label, week1_start, weeks_total)
  values (c_term_b, 'Parity Term B (dev)', 'PARITY DEV', v_week1, 4);
  insert into sections (id, course_id, term_id, code, instructor_id,
                        team_unlock_week, team_formation_deadline, team_size,
                        team_scoring_mode, weekly_claim_cap)
  values (c_sect_b, c_course_b, c_term_b, 'PB1', v_viewer,
          null, null, 3, 'from_unlock', null);

  raise notice 'PARITY FIXTURE applied: PA1 (ledger + formation, week 5 of 6) and PB1 (empty, term over). Run npm run test:parity, then fixture_wipe.sql.';
end $$;
