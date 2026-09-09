-- ============================================================
-- P8 PARITY FIXTURE WIPE — removes exactly what fixture.sql AND the
-- maintenance runs against it created, nothing else. Surgical,
-- marker-keyed (the 5eedc0de-…-b000-… block + the two fixture
-- section ids), idempotent from any partial state — same discipline
-- as seed_wipe.sql. Run in the dashboard SQL editor (postgres).
--
-- Run this BEFORE any future seed_wipe.sql: the fixture sections'
-- instructor_id is zseed99's profile, and maintenance-created teams
-- here have zseed captains — rows seed_wipe's step-3/4 profile
-- deletes would otherwise trip over.
--
-- point_events delete: append-only trigger disabled for exactly one
-- statement, then re-enabled (the sanctioned seed_wipe exception).
--
-- Section deletes cascade everything else the fixture or the jobs
-- wrote inside them: enrollments, cycles → cycle_champions,
-- rank_snapshots, teams → team_members/team_invites (including the
-- 'Team N' rows expire_team_formation created — they carry random
-- UUIDs, not b000 markers, which is why the wipe keys on the section
-- and not on team ids).
-- ============================================================

begin;

alter table point_events disable trigger trg_pe_no_delete;
delete from point_events
where section_id in ('5eedc0de-0000-4000-b000-000000005ec1',
                     '5eedc0de-0000-4000-b000-000000005ec2');
alter table point_events enable trigger trg_pe_no_delete;

delete from sections
where id in ('5eedc0de-0000-4000-b000-000000005ec1',
             '5eedc0de-0000-4000-b000-000000005ec2');
delete from terms
where id in ('5eedc0de-0000-4000-b000-000000007e01',
             '5eedc0de-0000-4000-b000-000000007e02');
delete from courses
where id in ('5eedc0de-0000-4000-b000-00000000c001',
             '5eedc0de-0000-4000-b000-00000000c002');

commit;

-- ---- post-wipe verification: every count below MUST be 0 ----
select
  (select count(*) from courses  where id::text like '5eedc0de-0000-4000-b000%')  as courses_left,
  (select count(*) from terms    where id::text like '5eedc0de-0000-4000-b000%')  as terms_left,
  (select count(*) from sections where id::text like '5eedc0de-0000-4000-b000%')  as sections_left,
  (select count(*) from point_events
    where section_id::text like '5eedc0de-0000-4000-b000%')                       as events_left,
  (select count(*) from cycles
    where section_id::text like '5eedc0de-0000-4000-b000%')                       as cycles_left,
  (select count(*) from rank_snapshots
    where section_id::text like '5eedc0de-0000-4000-b000%')                       as snapshots_left,
  (select count(*) from teams
    where section_id::text like '5eedc0de-0000-4000-b000%')                       as teams_left,
  (select count(*) from enrollments
    where section_id::text like '5eedc0de-0000-4000-b000%')                       as enrollments_left;
