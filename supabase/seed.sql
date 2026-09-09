-- ============================================================
-- FML dev seed (P4) — FAKE DATA ONLY. Companion: seed_wipe.sql
--
-- Run in the Supabase dashboard SQL editor (postgres role) of the
-- DEV project only. Every seeded row carries an unmistakable fake
-- marker so this can never be confused with real data:
--   · auth users / profiles: ccid 'zseed##', email '…@seed.fml.local'
--   · names: 'Seed Student One' … 'Seed Instructor'
--   · fixed UUIDs prefixed 5eedc0de-…
--   · course code 'ZSEED 101', term 'Seed Term (dev)'
--
-- Ledger discipline: point_events are inserted directly (the posting
-- RPCs stamp occurred_at = now(), so week-spread history cannot go
-- through them), but every event is shaped exactly like RPC output —
-- real parent result_sets / claims rows, matching source_kind and
-- points, no orphans. The append-only triggers stay enabled; INSERT
-- is the only verb used here.
--
-- Timeline is dynamic: week1_start = Monday 8 weeks ago, so the app
-- always renders mid-season (week 9 of 13) with a live cycle countdown.
--
-- To browse as a student: the app only accepts @ualberta.ca addresses,
-- so magic-link in with a PLUS-ALIAS of your own address (e.g.
-- you+seed@ualberta.ca — delivers to your inbox, but is a fresh auth
-- user). The automatic CCID match will miss; when the CCID prompt
-- appears type  zseed99  (staged below, zero points — shows the
-- personal empty states against a populated section).
-- ============================================================

do $$
declare
  v_real_profiles int;
  v_week1 date := (date_trunc('week', now()) - interval '8 weeks')::date;

  c_course  uuid := '5eedc0de-0000-4000-a000-00000000c001';
  c_term    uuid := '5eedc0de-0000-4000-a000-000000007e01';
  c_section uuid := '5eedc0de-0000-4000-a000-000000005ec1';
  c_instr   uuid := '5eedc0de-0000-4000-a000-000000000100';
  c_curve_w uuid := '5eedc0de-0000-4000-a000-000000000201';  -- wuclap default
  c_curve_g uuid := '5eedc0de-0000-4000-a000-000000000202';  -- game curve
  c_game_1  uuid := '5eedc0de-0000-4000-a000-000000000301';  -- closed, results posted
  c_game_2  uuid := '5eedc0de-0000-4000-a000-000000000302';  -- open now (hero card)
  c_game_3  uuid := '5eedc0de-0000-4000-a000-000000000303';  -- upcoming (opens in the future)
  c_game_4  uuid := '5eedc0de-0000-4000-a000-000000000304';  -- closed, awaiting close-out (P7)
  c_rs_void uuid := '5eedc0de-0000-4000-a000-00000000040a';  -- posted-then-voided demo
  c_rs_game uuid := '5eedc0de-0000-4000-a000-000000000409';

  -- student uuid by index 1..12
  v_sid uuid[];
  v_names text[] := array['One','Two','Three','Four','Five','Six',
                          'Seven','Eight','Nine','Ten','Eleven','Twelve'];
  v_rs uuid;
  w int; i int; r int; pts int;
  v_lecture timestamptz;
begin
  -- ---- tripwire: never run against anything that looks live ----
  select count(*) into v_real_profiles from profiles where ccid not like 'zseed%';
  if v_real_profiles > 10 then
    raise exception 'SEED ABORTED: % non-seed profiles exist — this looks like a live class DB', v_real_profiles;
  end if;
  if exists (select 1 from profiles where ccid like 'zseed%') then
    raise exception 'SEED ABORTED: seed already applied — run seed_wipe.sql first';
  end if;

  select array_agg(('5eedc0de-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid order by n)
    into v_sid from generate_series(1, 12) n;

  -- ---- auth users (fake; never log in) + profiles ----
  insert into auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
     confirmation_token, recovery_token, email_change_token_new, email_change)
  select '00000000-0000-0000-0000-000000000000',
         u.id, 'authenticated', 'authenticated', u.email, '', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
         '', '', '', ''
  from (
    select c_instr as id, 'zseed00@seed.fml.local' as email
    union all
    select v_sid[n], 'zseed' || lpad(n::text, 2, '0') || '@seed.fml.local'
    from generate_series(1, 12) n
  ) u;

  insert into profiles (id, full_name, ccid, role)
  values (c_instr, 'Seed Instructor', 'zseed00', 'instructor');
  insert into profiles (id, full_name, ccid, role)
  select v_sid[n], 'Seed Student ' || v_names[n], 'zseed' || lpad(n::text, 2, '0'), 'student'
  from generate_series(1, 12) n;

  -- ---- structure ----
  insert into courses (id, code, name)
  values (c_course, 'ZSEED 101', 'Seed Engineering Mechanics (dev)');
  insert into terms (id, name, season_label, week1_start, weeks_total)
  values (c_term, 'Seed Term (dev)', 'SEASON DEV', v_week1, 13);
  insert into sections (id, course_id, term_id, code, instructor_id,
                        team_unlock_week, team_formation_deadline, team_size,
                        team_scoring_mode, weekly_claim_cap)
  -- team_formation_deadline deliberately NULL (P8): a real deadline here
  -- would let the nightly maintenance cron auto-group the demo roster into
  -- teams at week 11. The teaser keys on team_unlock_week alone; P9 seeds
  -- a deadline when the formation flow exists to demo it.
  values (c_section, c_course, c_term, 'EB1', c_instr,
          11, null, 3, 'from_unlock', 10);

  insert into enrollments (section_id, student_id)
  select c_section, v_sid[n] from generate_series(1, 12) n;
  -- Student Eleven: enrolled, ZERO events (unranked-row display).
  -- Student Twelve: exactly one participation point (bottom of table).

  -- Sign-in-as-a-student staging row (see header).
  insert into pending_enrollments (ccid, full_name, role, section_id)
  values ('zseed99', 'Seed Viewer (You)', 'student', c_section);

  -- Also stage zseed99 into a real 'B1' section, if one exists — the
  -- designated cross-course test account (a deliberate choice made
  -- during P6 WuClap upload testing). link_user_on_first_login sweeps
  -- ALL of a ccid's unconsumed pending_enrollments rows on every login
  -- (data model §11), so this enrolls automatically on the next
  -- sign-in regardless of which section signs in first — no manual
  -- post-seed step, and it survives every reseed (seed_wipe.sql clears
  -- zseed-marked pending_enrollments rows outright, so this staging row
  -- never goes stale/already-consumed). No-op if no 'B1' section exists.
  insert into pending_enrollments (ccid, full_name, role, section_id)
  select 'zseed99', 'Seed Viewer (You)', 'student', s.id
  from sections s
  where s.code = 'B1' and s.id <> c_section
  limit 1;

  -- A second real-inbox tester (aelgarhy@ualberta.ca, 2026-08-23) was
  -- briefly staged here under an invented ccid ('zseed98', before that
  -- 'ztest01') — wrong on both tries. She predates this staging plan
  -- and already has her own real ccid from July; sign-in matching keys
  -- on ccid, not email, so staging a MADE-UP ccid for an existing
  -- person can never be consumed — their real sign-in derives/enters
  -- their actual ccid, which never matches the invented one. The
  -- invented row was deleted (see NIGHTLOG.md, 2026-08-23 entry).
  -- Lesson for next time: staging a person who already has an
  -- established ccid means finding and using THAT ccid, never picking
  -- a fresh marker just because the person is new to this app/table.
  --
  -- Her real ccid IS her email local-part: 'aelgarhy' (profiles row
  -- since 2026-07-12, already enrolled in real sections B1 + A1).
  -- Staged here into the seed section so the login sweep enrolls her
  -- on her next sign-in, and so a reseed restores that access: this
  -- row cascade-deletes with the seed section on wipe (not via the
  -- zseed% ccid sweep — 'aelgarhy' is deliberately NOT a zseed marker,
  -- it is a real person's real ccid; her profile and her real-section
  -- data are untouched by wipes).
  insert into pending_enrollments (ccid, full_name, role, section_id)
  values ('aelgarhy', 'Wife Test Student', 'student', c_section);

  -- ---- payout curves & claim rules ----
  insert into payout_curves (id, section_id, name, top_points, step, ranked_cutoff,
                             participation_floor, is_wuclap_default)
  values (c_curve_w, c_section, 'WuClap default (seed)', 10, 1, 8, 1, true),
         (c_curve_g, c_section, 'Game curve (seed)',     20, 2, 10, 1, false);

  insert into claim_rules (section_id, activity_type_id, base_points, escalation_step, escalation_cap)
  values (c_section, 'discussion',       3,  0, null),
         (c_section, 'correct_mistakes', 2,  1, 5),
         (c_section, 'act_as_professor', 10, 0, null),
         (c_section, 'demo',             5,  0, null);

  -- ---- games ----
  insert into games (id, section_id, title, blurb, matchday, launch_url, opens_at, closes_at, payout_curve_id)
  values
    (c_game_1, c_section, 'Statics Sprint (seed)',
     'Race the clock resolving force systems. Seed fixture — matchday 1.',
     1, 'https://example.com/seed/statics-sprint',
     v_week1::timestamptz + interval '6 weeks 1 day',
     v_week1::timestamptz + interval '6 weeks 4 days', c_curve_g),
    (c_game_2, c_section, 'Centroid Tetris (seed)',
     'Stack composite shapes; nail the centroid before the pieces pile up.',
     2, 'https://example.com/seed/centroid-tetris',
     now() - interval '1 day', now() + interval '3 days', c_curve_g),
    (c_game_3, c_section, 'Truss Trivia (seed)',
     'Speed-round trivia on method of joints vs. method of sections. Opens soon — matchday 3.',
     3, 'https://example.com/seed/truss-trivia',
     now() + interval '5 days', now() + interval '10 days', c_curve_g),
    (c_game_4, c_section, 'Friction Faceoff (seed)',
     'Head-to-head static/kinetic friction puzzles. Window closed — awaiting close-out upload.',
     4, 'https://example.com/seed/friction-faceoff',
     now() - interval '10 days', now() - interval '6 days', c_curve_g);

  insert into game_launches (student_id, game_id)
  select v_sid[n], c_game_1 from generate_series(2, 7) n;
  insert into game_launches (student_id, game_id)
  select v_sid[n], c_game_2 from unnest(array[1, 3, 5]) n;  -- players_count = 3
  insert into game_launches (student_id, game_id)
  select v_sid[n], c_game_4 from unnest(array[2, 4, 6, 8]) n;  -- players_count = 4, still awaiting close-out

  -- ---- weekly WuClap history, weeks 1..8 ----
  -- Students 1..10 participate each week; ranks rotate by 3 per week
  -- (rank = ((i-1 + 3*(w-1)) mod 10) + 1) so standings churn and trend
  -- arrows point both ways. Points via curve_points() — same math the
  -- posting RPC uses.
  for w in 1..8 loop
    v_rs := ('5eedc0de-0000-4000-a000-0000000004' || lpad(w::text, 2, '0'))::uuid;
    v_lecture := v_week1::timestamptz + make_interval(weeks => w - 1, days => 2, hours => 18);

    insert into result_sets (id, section_id, source, label, payout_curve_id,
                             uploaded_by, uploaded_at, file_name, status)
    values (v_rs, c_section, 'wuclap', 'Lecture ' || lpad((2 * w)::text, 2, '0') || ' (seed)',
            c_curve_w, c_instr, v_lecture, 'seed_lecture_' || w || '.csv', 'posted');

    for i in 1..10 loop
      r := ((i - 1 + 3 * (w - 1)) % 10) + 1;
      pts := curve_points(r, 10, 1, 8, 1);
      insert into result_rows (result_set_id, ccid, student_id, rank)
      values (v_rs, 'zseed' || lpad(i::text, 2, '0'), v_sid[i], r);
      insert into point_events (section_id, student_id, activity_type_id, points,
                                source_kind, source_id, occurred_at, week_number)
      values (c_section, v_sid[i], 'wuclap', pts, 'result_set', v_rs, v_lecture, w);
    end loop;

    if w = 2 then  -- Student Twelve: participated once, unranked → floor point
      insert into result_rows (result_set_id, ccid, student_id, rank)
      values (v_rs, 'zseed12', v_sid[12], null);
      insert into point_events (section_id, student_id, activity_type_id, points,
                                source_kind, source_id, occurred_at, week_number)
      values (c_section, v_sid[12], 'wuclap', curve_points(null, 10, 1, 8, 1),
              'result_set', v_rs, v_lecture, 2);
    end if;
  end loop;

  -- ---- posted-then-VOIDED result set (week 5): negatives must net out ----
  v_lecture := v_week1::timestamptz + make_interval(weeks => 4, days => 3, hours => 18);
  insert into result_sets (id, section_id, source, label, payout_curve_id,
                           uploaded_by, uploaded_at, file_name, status)
  values (c_rs_void, c_section, 'wuclap', 'Lecture 10 (seed, voided)',
          c_curve_w, c_instr, v_lecture, 'seed_lecture_10_dupe.csv', 'voided');
  for i in 1..3 loop
    insert into result_rows (result_set_id, ccid, student_id, rank)
    values (c_rs_void, 'zseed' || lpad(i::text, 2, '0'), v_sid[i], i);
    insert into point_events (section_id, student_id, activity_type_id, points,
                              source_kind, source_id, occurred_at, week_number)
    values (c_section, v_sid[i], 'wuclap', curve_points(i, 10, 1, 8, 1),
            'result_set', c_rs_void, v_lecture, 5);
    insert into point_events (section_id, student_id, activity_type_id, points,
                              source_kind, source_id, reason, occurred_at, week_number)
    values (c_section, v_sid[i], 'wuclap', -curve_points(i, 10, 1, 8, 1),
            'adjustment', c_rs_void, 'void of result set Lecture 10 (seed, voided)',
            v_lecture + interval '1 hour', 5);
  end loop;

  -- ---- game result set (week 7, Statics Sprint) ----
  v_lecture := v_week1::timestamptz + make_interval(weeks => 6, days => 4, hours => 12);
  insert into result_sets (id, section_id, source, game_id, label, payout_curve_id,
                           uploaded_by, uploaded_at, file_name, status)
  values (c_rs_game, c_section, 'game_upload', c_game_1, 'Statics Sprint — Matchday 1 (seed)',
          c_curve_g, c_instr, v_lecture, 'seed_sprint_results.csv', 'posted');
  for i in 2..7 loop
    r := i - 1;  -- students 2..7 finish ranks 1..6
    insert into result_rows (result_set_id, ccid, student_id, rank)
    values (c_rs_game, 'zseed' || lpad(i::text, 2, '0'), v_sid[i], r);
    insert into point_events (section_id, student_id, activity_type_id, points,
                              source_kind, source_id, occurred_at, week_number)
    values (c_section, v_sid[i], 'game', curve_points(r, 20, 2, 10, 1),
            'result_set', c_rs_game, v_lecture, 7);
  end loop;

  -- ---- claims: approved (with events), one instructor override (10→12),
  --      one same-lecture escalation pair (2 then 3), one rejected, two
  --      pending. The s2 week-2 correct_mistakes claim deliberately creates
  --      a cycle-1 points TIE with s1 → exercises co-champions rendering.
  --      lecture_date = Wednesday of the claim's week. ----
  -- week_number is stamped 0 here and fixed up by the UPDATE right below
  -- (mirrors the week_number_for(section_id, created_at) backfill in
  -- migration 0007 — can't reference a sibling column's expression from
  -- within the same VALUES row, so it's a two-step insert+update).
  insert into claims (id, section_id, student_id, activity_type_id, lecture_date,
                      description, computed_points, awarded_points, status,
                      created_at, reviewed_by, reviewed_at, week_number)
  values
    ('5eedc0de-0000-4000-a000-000000000501', c_section, v_sid[1], 'discussion',
     (v_week1 + 16), 'Seed: kicked off the friction cone debate', 3, null, 'approved',
     v_week1::timestamptz + interval '2 weeks 3 days',  c_instr, v_week1::timestamptz + interval '2 weeks 4 days', 0),
    ('5eedc0de-0000-4000-a000-000000000502', c_section, v_sid[2], 'correct_mistakes',
     (v_week1 + 9),  'Seed: caught sign error in moment equation', 2, null, 'approved',
     v_week1::timestamptz + interval '1 week 3 days',   c_instr, v_week1::timestamptz + interval '1 week 4 days', 0),
    ('5eedc0de-0000-4000-a000-000000000503', c_section, v_sid[1], 'correct_mistakes',
     (v_week1 + 30), 'Seed: spotted wrong reaction direction at support B', 2, null, 'approved',
     v_week1::timestamptz + interval '4 weeks 3 days',  c_instr, v_week1::timestamptz + interval '4 weeks 4 days', 0),
    ('5eedc0de-0000-4000-a000-000000000504', c_section, v_sid[2], 'act_as_professor',
     (v_week1 + 23), 'Seed: taught the 3D equilibrium recap segment', 10, 12, 'approved',
     v_week1::timestamptz + interval '3 weeks 3 days',  c_instr, v_week1::timestamptz + interval '3 weeks 4 days', 0),
    ('5eedc0de-0000-4000-a000-000000000505', c_section, v_sid[3], 'correct_mistakes',
     (v_week1 + 30), 'Seed: first mistake caught (units on q)', 2, null, 'approved',
     v_week1::timestamptz + interval '4 weeks 3 days',  c_instr, v_week1::timestamptz + interval '4 weeks 4 days', 0),
    ('5eedc0de-0000-4000-a000-000000000506', c_section, v_sid[3], 'correct_mistakes',
     (v_week1 + 30), 'Seed: second mistake same lecture (escalated 2→3)', 3, null, 'approved',
     v_week1::timestamptz + interval '4 weeks 3 days',  c_instr, v_week1::timestamptz + interval '4 weeks 4 days', 0),
    ('5eedc0de-0000-4000-a000-000000000507', c_section, v_sid[4], 'demo',
     (v_week1 + 37), 'Seed: truss bridge demo with load cell', 5, null, 'approved',
     v_week1::timestamptz + interval '5 weeks 3 days',  c_instr, v_week1::timestamptz + interval '5 weeks 4 days', 0),
    ('5eedc0de-0000-4000-a000-000000000508', c_section, v_sid[5], 'discussion',
     (v_week1 + 9),  'Seed: asked the distributed-load question', 3, null, 'approved',
     v_week1::timestamptz + interval '1 week 3 days',   c_instr, v_week1::timestamptz + interval '1 week 4 days', 0),
    ('5eedc0de-0000-4000-a000-000000000509', c_section, v_sid[6], 'discussion',
     (v_week1 + 44), 'Seed: challenged the centroid shortcut', 3, null, 'approved',
     v_week1::timestamptz + interval '6 weeks 3 days',  c_instr, v_week1::timestamptz + interval '6 weeks 4 days', 0),
    ('5eedc0de-0000-4000-a000-00000000050a', c_section, v_sid[2], 'discussion',
     (v_week1 + 37), 'Seed: rejected example — off-topic remark', 3, null, 'rejected',
     v_week1::timestamptz + interval '5 weeks 3 days',  c_instr, v_week1::timestamptz + interval '5 weeks 4 days', 0),
    ('5eedc0de-0000-4000-a000-00000000050b', c_section, v_sid[1], 'discussion',
     current_date, 'Seed: pending — today''s lecture question', 3, null, 'pending',
     now() - interval '2 hours', null, null, 0),
    ('5eedc0de-0000-4000-a000-00000000050c', c_section, v_sid[3], 'correct_mistakes',
     current_date, 'Seed: pending — caught missing moment arm', 2, null, 'pending',
     now() - interval '1 hour', null, null, 0);

  update claims set week_number = week_number_for(section_id, created_at)
  where id::text like '5eedc0de%' and section_id = c_section;

  -- events for the approved claims (awarded ?? computed), week = claim's week
  insert into point_events (section_id, student_id, activity_type_id, points,
                            source_kind, source_id, occurred_at, week_number)
  select c.section_id, c.student_id, c.activity_type_id,
         coalesce(c.awarded_points, c.computed_points),
         'claim', c.id, c.reviewed_at,
         week_number_for(c.section_id, c.reviewed_at)
  from claims c
  where c.id::text like '5eedc0de%' and c.status = 'approved';

  -- ---- instructor ad-hoc grant (adjustment, no parent row by design) ----
  insert into point_events (section_id, student_id, activity_type_id, points,
                            source_kind, reason, occurred_at, week_number)
  values (c_section, v_sid[5], 'discussion', 10, 'adjustment',
          'Instructor award (seed): exceptional whiteboard proof',
          v_week1::timestamptz + interval '5 weeks 2 days', 6);

  -- ---- bi-weekly cycles: 6 generated; 1–4 finalized, 5 in play ----
  insert into cycles (id, section_id, number, week_start, week_end, finalized_at)
  select ('5eedc0de-0000-4000-a000-0000000006' || lpad(n::text, 2, '0'))::uuid,
         c_section, n, 2 * n - 1, 2 * n,
         case when n <= 4 then v_week1::timestamptz + make_interval(weeks => 2 * n, hours => 1) end
  from generate_series(1, 6) n;

  -- champions computed from the seeded ledger itself (rank() = competition
  -- ranking) so displayed champions always equal the sum of their events;
  -- cycle 1 contains an engineered s1/s2 tie → co-champions.
  insert into cycle_champions (cycle_id, student_id, points)
  select cy.id, t.student_id, t.pts
  from cycles cy
  cross join lateral (
    select pe.student_id, sum(pe.points) as pts,
           rank() over (order by sum(pe.points) desc) as rk
    from point_events pe
    where pe.section_id = cy.section_id
      and pe.week_number between cy.week_start and cy.week_end
    group by pe.student_id
  ) t
  where cy.section_id = c_section and cy.finalized_at is not null and t.rk = 1;

  -- ---- weekly rank snapshots, end of weeks 1..8 (powers trend arrows) ----
  insert into rank_snapshots (section_id, student_id, week_number, rank, total_points)
  select c_section, t.student_id, w.w, t.rk, t.pts
  from generate_series(1, 8) w(w)
  cross join lateral (
    select pe.student_id, sum(pe.points) as pts,
           rank() over (order by sum(pe.points) desc) as rk
    from point_events pe
    where pe.section_id = c_section and pe.week_number <= w.w
    group by pe.student_id
  ) t;

  raise notice 'FML seed applied: section EB1 (ZSEED 101), 12 students, weeks 1–8 history, week-9 season position.';
end $$;

-- ------------------------------------------------------------
-- Part 2 — THIS week's lecture, posted through the REAL RPC.
-- post_result_set stamps occurred_at = now(), which lands in the
-- current week (9) by construction, so no backdating is needed:
-- this exercises the production posting path end-to-end AND gives
-- the trend arrows / THIS WEEK columns live movement (bottom of
-- the table wins this lecture, so ranks churn in both directions).
-- ------------------------------------------------------------
do $$
declare
  c_section uuid := '5eedc0de-0000-4000-a000-000000005ec1';
  c_curve_w uuid := '5eedc0de-0000-4000-a000-000000000201';
  c_instr   uuid := '5eedc0de-0000-4000-a000-000000000100';
  c_rs      uuid := '5eedc0de-0000-4000-a000-000000000411';
begin
  if exists (select 1 from result_sets where id = c_rs) then
    raise notice 'week-9 lecture already posted — skipping';
    return;
  end if;

  insert into result_sets (id, section_id, source, label, payout_curve_id,
                           uploaded_by, file_name, status)
  values (c_rs, c_section, 'wuclap', 'Lecture 17 (seed, this week)',
          c_curve_w, c_instr, 'seed_lecture_17.csv', 'parsed');

  -- (student index, rank): the season's stragglers take this lecture;
  -- rank null = participated unranked → participation floor.
  insert into result_rows (result_set_id, ccid, student_id, rank)
  select c_rs, 'zseed' || lpad(v.idx::text, 2, '0'),
         ('5eedc0de-0000-4000-a000-0000000000' || lpad(v.idx::text, 2, '0'))::uuid,
         v.rnk
  from (values (8,1),(9,2),(10,3),(12,4),(7,5),(1,6),(6,7),(5,8),(4,9),(3,10),(2,null)) v(idx, rnk);

  -- post_result_set now checks is_instructor_of() via auth.uid(); the SQL
  -- editor session has no JWT, so impersonate the seed instructor for this
  -- one call (scoped to this transaction only).
  perform set_config('request.jwt.claims', json_build_object('sub', c_instr)::text, true);
  perform post_result_set(c_rs);
end $$;

-- ------------------------------------------------------------
-- OPTIONAL Part 3, run AFTER you first sign in as the zseed99
-- viewer: gives your student account a week-spread history so the
-- personal widgets populate. Calibrated against the seeded field:
-- 36 pts through week 8 (rank 11 snapshot), +15 this week → total
-- 51, live rank 8 → the rank card shows "▲ 3 places this week",
-- and the +15 tops cycle 5 ("you're #1 this cycle").
-- Uncomment and run once (idempotent).
-- ------------------------------------------------------------
-- do $$
-- declare
--   v_me uuid;
--   c_section uuid := '5eedc0de-0000-4000-a000-000000005ec1';
--   v_week1 date;
-- begin
--   select id into v_me from profiles where ccid = 'zseed99';
--   if v_me is null then raise exception 'sign in as zseed99 first'; end if;
--   if exists (select 1 from point_events where student_id = v_me) then
--     raise notice 'viewer history already applied — skipping'; return;
--   end if;
--   select t.week1_start into v_week1
--   from sections s join terms t on t.id = s.term_id where s.id = c_section;
--
--   -- weeks 3–8 WuClap history: 6,7,5,6,7,5 = 36 pts
--   insert into point_events (section_id, student_id, activity_type_id, points,
--                             source_kind, reason, occurred_at, week_number)
--   select c_section, v_me, 'wuclap', v.p, 'adjustment', 'Seed viewer history (dev)',
--          v_week1::timestamptz + make_interval(weeks => v.w - 1, days => 2, hours => 18), v.w
--   from (values (3,6),(4,7),(5,5),(6,6),(7,7),(8,5)) v(w, p);
--
--   -- end-of-week-8 snapshot: 36 pts slots at rank 11 of the seeded field
--   insert into rank_snapshots (section_id, student_id, week_number, rank, total_points)
--   values (c_section, v_me, 8, 11, 36);
--
--   -- this week: game +10, discussion +5 (breakdown variety)
--   insert into point_events (section_id, student_id, activity_type_id, points,
--                             source_kind, reason, occurred_at, week_number)
--   values
--     (c_section, v_me, 'game', 10, 'adjustment', 'Seed viewer history (dev)',
--      now(), week_number_for(c_section, now())),
--     (c_section, v_me, 'discussion', 5, 'adjustment', 'Seed viewer history (dev)',
--      now(), week_number_for(c_section, now()));
-- end $$;

-- ------------------------------------------------------------
-- Part 4 (cross-enroll zseed99 into 'B1'): now automatic — see the
-- pending_enrollments insert in Part 1 above. Sign in as
-- you+seed@ualberta.ca (CCID zseed99 if the auto match misses) and the
-- next login sweep enrolls you into both the seed section and 'B1' in
-- one shot, no manual step required here.
-- ------------------------------------------------------------
