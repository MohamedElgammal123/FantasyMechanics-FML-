-- ============================================================
-- FML dev seed WIPE — removes exactly what seed.sql created,
-- nothing else. Surgical deletes keyed on the seed markers
-- (5eedc0de-… UUIDs, ccid 'zseed%', email '…@seed.fml.local').
-- Never a truncate. Run in the dashboard SQL editor (postgres).
--
-- point_events is append-only by trigger; that discipline exists
-- to protect PRODUCTION mutations. Deleting clearly-marked seed
-- rows as postgres is the sanctioned exception: the delete trigger
-- is disabled for exactly one statement, then immediately
-- re-enabled. FK cascades stay live throughout (no
-- session_replication_role tricks).
--
-- Bug fixed here: most FKs to profiles(id) (enrollments.student_id,
-- game_launches.student_id, claims.student_id, point_events.student_id,
-- result_rows.student_id, rank_snapshots.student_id,
-- cycle_champions.student_id) do NOT cascade on delete. The original
-- version of this script only cleared rows inside the seed section, so
-- any residue from self-testing zseed99 (or any zseed account) in a
-- REAL section — e.g. a B1 enrollment, a claim, a game_launches PLAY
-- click — survived the section delete and then blocked
-- `delete from profiles`/`delete from auth.users` with FK violation
-- 23503. Step 1 below sweeps every such table by PROFILE MARKER
-- (ccid like 'zseed%'), across every section, not just the seed one —
-- so this class of bug can't recur regardless of which real section
-- someone self-tests in.
--
-- Idempotent by design: every statement below is scoped by id/pattern,
-- so re-running this script from ANY partial state (a previous run that
-- got partway through, or one that already removed the seed section
-- but not the cross-section residue) is safe — a DELETE that matches
-- zero rows is not an error. The seed section itself is no longer a
-- precondition for the rest of the script (see the tripwire below): a
-- fully-wiped seed section coexisting with leftover zseed residue
-- elsewhere is exactly the state this script needs to be able to clean
-- up, not refuse to touch.
-- ============================================================

begin;

-- Informational only — NOT an abort. A missing seed section does not
-- mean "nothing to remove": zseed-marked residue can legitimately
-- outlive the seed section (that's the whole bug this script fixes).
-- Skips nothing on its own; step 2 below naturally no-ops on IDs that
-- are already gone.
do $$
begin
  if not exists (select 1 from sections where id = '5eedc0de-0000-4000-a000-000000005ec1') then
    raise notice 'seed section already gone (partial/prior wipe) — continuing to sweep any zseed-marked residue in other sections';
  end if;
end $$;

-- ---- 1. Cross-section residue, swept by profile marker (not section) ----
-- Catches self-test artifacts in any REAL section (e.g. B1: zseed99's
-- PLAY clicks, submitted/approved claims, points earned) as well as the
-- seed section's own rows (redundant with step 2's cascade, harmless).
--
-- Each delete below re-resolves `select id from profiles where ccid like
-- 'zseed%'` inline rather than through a shared temp table — a prior
-- version used `create temporary table ... on commit drop` here, which
-- failed with "relation does not exist" when the dashboard SQL editor
-- didn't keep every statement in this script on the same session (temp
-- tables are session-scoped). A plain subquery has no cross-statement
-- state to lose, so it can't break that way regardless of how the
-- editor batches/pools the statements — the profiles table is tiny and
-- seed-only, so re-resolving it seven times costs nothing.
alter table point_events disable trigger trg_pe_no_delete;
delete from point_events where student_id in (select id from profiles where ccid like 'zseed%');
alter table point_events enable trigger trg_pe_no_delete;

delete from claims           where student_id in (select id from profiles where ccid like 'zseed%');
delete from cycle_champions  where student_id in (select id from profiles where ccid like 'zseed%');
delete from rank_snapshots   where student_id in (select id from profiles where ccid like 'zseed%');
delete from result_rows      where student_id in (select id from profiles where ccid like 'zseed%');
delete from game_launches    where student_id in (select id from profiles where ccid like 'zseed%');

-- Teams CAN hold zseed rows since P8: expire_team_formation auto-groups
-- enrolled students at the deadline (EB1's deadline is week 11, so a
-- late-season cron run WILL create zseed-captained teams there — and any
-- real section a zseed account enrolled in can auto-group it too).
-- Sweep invites → members → teams, by profile marker, before profiles go.
delete from team_invites where invitee_id in (select id from profiles where ccid like 'zseed%');
delete from team_members where student_id  in (select id from profiles where ccid like 'zseed%');
delete from teams        where captain_id  in (select id from profiles where ccid like 'zseed%');

delete from enrollments      where student_id in (select id from profiles where ccid like 'zseed%');

-- Staging rows are keyed by ccid, not a profiles FK, but a zseed-ccid
-- row is synthetic regardless of which section it stages into (e.g. the
-- B1 cross-enroll staging row seed.sql now creates) — delete outright
-- rather than leave a stale consumed row a future reseed would collide
-- with (unique (ccid, section_id)).
delete from pending_enrollments where ccid like 'zseed%';

-- NOT swept: gradebook_uploads/gradebook_rows (P10) — no UI/RPC writes
-- to them yet per CLAUDE.md's build order, so they cannot hold a
-- seed-profile row. (Teams WERE in this list until P8 made
-- expire_team_formation write them — swept above since.)
-- claims.reviewed_by / result_sets.uploaded_by / sections.instructor_id
-- / gradebook_uploads.uploaded_by — not swept: would require a seed
-- account to have authenticated and acted as instructor, which never
-- happens (zseed00 is a fake auth user that never logs in, per
-- seed.sql's header comment).

-- ---- 2. The seed section — cascades whatever step 1 didn't already
--    catch (payout_curves, games, any remaining game_launches/
--    result_sets→result_rows/claims/cycles→cycle_champions/
--    rank_snapshots scoped to the seed section). ----
-- A REAL tester enrolled in the seed section (e.g. 'aelgarhy', staged
-- into EB1 by seed.sql since 2026-08-23) can hold point_events there
-- that step 1's zseed sweep deliberately skips — but the section
-- delete below CASCADES into point_events with trg_pe_no_delete
-- enabled, which would abort the whole wipe. Clear the seed section's
-- remaining ledger rows under the same one-statement trigger exception
-- step 1 uses. Seed-section rows only; real sections untouched.
alter table point_events disable trigger trg_pe_no_delete;
delete from point_events where section_id = '5eedc0de-0000-4000-a000-000000005ec1';
alter table point_events enable trigger trg_pe_no_delete;

delete from sections where id = '5eedc0de-0000-4000-a000-000000005ec1';
delete from terms    where id = '5eedc0de-0000-4000-a000-000000007e01';
delete from courses  where id = '5eedc0de-0000-4000-a000-00000000c001';

-- ---- 3. The zseed99 viewer signed in with a REAL email, so their auth
--    user is deliberately kept; only the seed-linked profile goes —
--    safe now, every table that could reference it was swept in step 1.
--    Re-seeding recreates the staging row(s), so the next sign-in relinks. ----
delete from profiles where ccid = 'zseed99';

-- ---- 4. Fake auth users (cascades their profiles — zseed00, zseed01-12
--    — already safe to remove, step 1 swept everything that could
--    reference them). Matches ONLY the @seed.fml.local addresses
--    created by seed.sql. ----
delete from auth.users where email like '%@seed.fml.local';

commit;
