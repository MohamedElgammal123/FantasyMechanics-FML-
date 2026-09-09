-- ============================================================
-- P9 seed addendum — FAKE DATA ONLY, UNAPPLIED, FOR AHMED'S REVIEW.
-- Written 2026-08-18 during the P9 (team mode UI) overnight batch.
-- Do NOT run this without reading it first. Companion to (not a
-- replacement for) supabase/seed.sql — apply seed.sql first.
--
-- Why a separate file: CLAUDE.md says seed additions for demoing
-- formation states must be their own flagged file, never folded into
-- seed.sql directly.
--
-- What this does, in one transaction:
--   1. Bumps the seed section's team_unlock_week from 11 down to 8
--      (value chosen by Ahmed, 2026-08-23 — see "why the unlock-week
--      change" below), and sets team_formation_deadline (currently
--      NULL) to week1_start + 10 weeks.
--   2. Seeds 4 teams among the 12 zseed students covering every
--      status the UI renders: forming (2a), locked / auto_grouped /
--      incomplete (2b) — plus a pending, a declined, and a cancelled
--      invite for status-badge coverage, and 3 prize tiers (Bronze
--      900 / Silver 1400 / Gold 2000, same numbers as the design
--      mockup) so the prize track isn't an empty panel.
--
-- Why the unlock-week change: seed.sql seeded team_unlock_week = 11
-- deliberately, with a comment noting "P9 seeds a deadline when the
-- formation flow exists to demo it" — but the app's own "current week"
-- is derived from terms.week1_start vs now(), and week1_start is fixed
-- at seed-apply time, so it only reaches week 11 by calendar drift.
-- Left at 11, team mode still reads LOCKED — no code changes needed to
-- prove that path works (it already did, pre-P9). To actually exercise
-- the P9 screens, team mode needs to already be unlocked; 8 was picked
-- (2026-08-23) as the smallest bump that's already <= the section's
-- current week rather than an arbitrarily early one. If the section's
-- current week has drifted past 8 by the time this runs, bump the
-- literal below further, or skip section 1 entirely and re-run section
-- 2 once week 11 arrives naturally — everything in section 2 is
-- independent of the unlock week (teams can be seeded regardless of
-- whether the teaser is currently showing).
--
-- Formation deadline is set to +10 weeks from week1_start (comfortably
-- ahead of "now") — formation stays OPEN, so the "forming"
-- team (SHEAR MADNESS) and its live countdown are honest. The already
-- locked/auto_grouped/incomplete teams below are seeded directly
-- rather than reached by actually running expire_team_formation before
-- its own deadline — they exist to show every rendering state at once
-- for review, not to claim the deadline has literally elapsed. If that
-- bothers you, push the deadline into the past instead (swap the
-- interval below to '-1 week') and accept that SHEAR MADNESS would
-- then read as stale/expired-looking until you re-run
-- run_section_maintenance to actually process it.
--
-- Wipe: NOT a new file — supabase/seed_wipe.sql already sweeps
-- team_invites/team_members/teams by zseed profile marker (added when
-- P8 taught expire_team_formation to write those tables), and cascades
-- prize_tiers via the section delete. Nothing here needs a new wipe
-- path. Re-running THIS file after a wipe+reseed is safe (guarded
-- below); re-running it WITHOUT a wipe in between is not — it will
-- hit the "already applied" guard and abort, same convention as
-- seed.sql itself.
-- ============================================================

do $$
declare
  c_section uuid := '5eedc0de-0000-4000-a000-000000005ec1';
  c_term    uuid := '5eedc0de-0000-4000-a000-000000007e01';
  v_week1   date;
  v_sid uuid[];
  n int;
begin
  if not exists (select 1 from sections where id = c_section) then
    raise exception 'SEED ABORTED: run supabase/seed.sql first — the P9 addendum builds on the seeded EB1 section';
  end if;
  if exists (select 1 from teams where section_id = c_section) then
    raise exception 'SEED ABORTED: P9 addendum already applied — run seed_wipe.sql first, then seed.sql, then this file';
  end if;

  select array_agg(('5eedc0de-0000-4000-a000-0000000000' || lpad(gs::text, 2, '0'))::uuid order by gs)
    into v_sid from generate_series(1, 12) gs;
  select week1_start into v_week1 from terms where id = c_term;

  -- ---- 1. unlock the section (see header) ----
  update sections
  set team_unlock_week = 8,
      team_formation_deadline = v_week1::timestamptz + interval '10 weeks'
  where id = c_section;

  -- ---- 2a state: SHEAR MADNESS — forming, 2/3, one pending invite ----
  insert into teams (id, section_id, name, captain_id, status, created_at)
  values ('5eedc0de-0000-4000-a000-000000000703', c_section, 'Shear Madness', v_sid[7], 'forming', now() - interval '3 days');
  insert into team_members (team_id, student_id, joined_at) values
    ('5eedc0de-0000-4000-a000-000000000703', v_sid[7], now() - interval '3 days'),
    ('5eedc0de-0000-4000-a000-000000000703', v_sid[8], now() - interval '2 days');
  insert into team_invites (id, team_id, invitee_id, status, sent_at, responded_at) values
    ('5eedc0de-0000-4000-a000-000000000801', '5eedc0de-0000-4000-a000-000000000703', v_sid[9], 'pending', now() - interval '1 day', null),
    -- flavor rows for status-badge coverage (cancel/decline), not load-bearing for the current squad:
    ('5eedc0de-0000-4000-a000-000000000803', '5eedc0de-0000-4000-a000-000000000703', v_sid[12], 'cancelled', now() - interval '3 days', now() - interval '2 days 12 hours');

  -- ---- 2b state (locked): TORQUE SUPREMACY — full, formed before the deadline ----
  insert into teams (id, section_id, name, captain_id, status, locked_at, created_at)
  values ('5eedc0de-0000-4000-a000-000000000701', c_section, 'Torque Supremacy', v_sid[1], 'locked', now() - interval '1 day', now() - interval '4 days');
  insert into team_members (team_id, student_id, joined_at) values
    ('5eedc0de-0000-4000-a000-000000000701', v_sid[1], now() - interval '4 days'),
    ('5eedc0de-0000-4000-a000-000000000701', v_sid[2], now() - interval '3 days'),
    ('5eedc0de-0000-4000-a000-000000000701', v_sid[3], now() - interval '1 day');
  insert into team_invites (id, team_id, invitee_id, status, sent_at, responded_at) values
    ('5eedc0de-0000-4000-a000-000000000802', '5eedc0de-0000-4000-a000-000000000701', v_sid[4], 'declined', now() - interval '4 days', now() - interval '3 days 20 hours');

  -- ---- 2b state (auto_grouped): GEAR UP — captain+early members kept
  -- per D2, v_sid[6] filled in by expire_team_formation at the deadline
  -- (joined_at = the deadline instant → wasAutoFilled() reads true) ----
  insert into teams (id, section_id, name, captain_id, status, locked_at, created_at)
  values ('5eedc0de-0000-4000-a000-000000000702', c_section, 'Gear Up', v_sid[4], 'auto_grouped', v_week1::timestamptz + interval '10 weeks', now() - interval '5 days');
  insert into team_members (team_id, student_id, joined_at) values
    ('5eedc0de-0000-4000-a000-000000000702', v_sid[4], now() - interval '5 days'),
    ('5eedc0de-0000-4000-a000-000000000702', v_sid[5], now() - interval '4 days'),
    ('5eedc0de-0000-4000-a000-000000000702', v_sid[6], v_week1::timestamptz + interval '10 weeks');

  -- ---- 2b state (incomplete): "Team 5" — system-generated from the
  -- leftover pool (no prior captain choice to "keep" — captain is
  -- simply the first of the chunk, per planFormationExpiry) ----
  insert into teams (id, section_id, name, captain_id, status, locked_at, created_at)
  values ('5eedc0de-0000-4000-a000-000000000704', c_section, 'Team 5', v_sid[10], 'incomplete', v_week1::timestamptz + interval '10 weeks', v_week1::timestamptz + interval '10 weeks');
  insert into team_members (team_id, student_id, joined_at) values
    ('5eedc0de-0000-4000-a000-000000000704', v_sid[10], v_week1::timestamptz + interval '10 weeks'),
    ('5eedc0de-0000-4000-a000-000000000704', v_sid[11], v_week1::timestamptz + interval '10 weeks');

  -- v_sid[12] deliberately left unteamed — honest "no team yet, formation
  -- still open" state (nobody has invited them, they haven't started
  -- their own team either).

  -- ---- prize tiers (team scope) — same numbers as the design mockup ----
  insert into prize_tiers (section_id, scope, name, threshold_points, reward_text) values
    (c_section, 'team', 'Bronze', 900,  'Mola kit for every member'),
    (c_section, 'team', 'Silver', 1400, 'Papyrus keepsake'),
    (c_section, 'team', 'Gold',   2000, 'Season trophy + crest patches');

  raise notice 'P9 addendum applied: EB1 team_unlock_week=8, 4 teams (forming/locked/auto_grouped/incomplete), 3 prize tiers.';
end $$;
