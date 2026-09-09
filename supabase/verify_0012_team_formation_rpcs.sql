-- ============================================================
-- Negative-auth verification for supabase/migrations/0012_team_formation_rpcs.sql.
-- Run this AFTER applying 0012 and AFTER supabase/seed.sql, but
-- BEFORE supabase/seed_p9_addendum.sql (that file sets the section's
-- real team_unlock_week/team_formation_deadline; this script only
-- needs an *unlocked* window to exist long enough to run its own
-- throwaway fixtures through it, and restores the section's original
-- values when done either way).
--
-- Non-destructive by construction: everything runs inside ONE
-- transaction (a single top-level `do $$ ... $$` block), all fixture
-- rows use a dedicated uuid range (…-a000-00000000ff0N) that the real
-- seed data never touches, every "should be rejected" call is wrapped
-- in its own nested exception handler (an implicit savepoint — a
-- caught exception rolls back only that call's attempted writes, not
-- the whole script), fixtures are explicitly deleted and the section's
-- original team_unlock_week/team_formation_deadline restored before
-- the block ends, and if anything truly unanticipated goes wrong the
-- ENTIRE transaction rolls back atomically (nothing partially applied).
-- Re-runnable any number of times.
--
-- Impersonation uses the same technique seed.sql's Part 2 already uses
-- for post_result_set: `set_config('request.jwt.claims', …, true)`
-- sets auth.uid() for the rest of THIS transaction. Read every
-- `raise notice` line the script prints — a script that runs to
-- completion without a Postgres ERROR is not the same as "all 4 tests
-- passed"; a mis-worded rejection message would still show as a
-- printed FAIL line, not a crash.
-- ============================================================

do $$
declare
  c_section uuid := '5eedc0de-0000-4000-a000-000000005ec1';
  v_sid uuid[];
  v_orig_unlock int;
  v_orig_deadline timestamptz;
  v_result teams;
begin
  if not exists (select 1 from sections where id = c_section) then
    raise exception 'VERIFY ABORTED: run supabase/seed.sql first';
  end if;
  if not exists (select 1 from pg_proc where proname = 'create_team') then
    raise exception 'VERIFY ABORTED: 0012_team_formation_rpcs.sql is not applied yet';
  end if;

  select array_agg(('5eedc0de-0000-4000-a000-0000000000' || lpad(gs::text, 2, '0'))::uuid order by gs)
    into v_sid from generate_series(1, 12) gs;

  -- ---- open a temporary unlocked window so create_team's own window
  -- guards don't mask the tests below; restored at the end regardless
  -- of outcome. ----
  select team_unlock_week, team_formation_deadline into v_orig_unlock, v_orig_deadline
  from sections where id = c_section;
  update sections set team_unlock_week = 1, team_formation_deadline = now() + interval '1 week'
  where id = c_section;

  -- ================= Test 1: non-enrolled create rejected =================
  begin
    -- the seed instructor (zseed00) is never an enrollments row anywhere.
    perform set_config('request.jwt.claims', json_build_object('sub', '5eedc0de-0000-4000-a000-000000000100')::text, true);
    v_result := create_team(c_section, 'Should Not Exist');
    raise exception 'SELF-CHECK-FAIL: create_team unexpectedly succeeded for a non-enrolled caller';
  exception
    when others then
      if sqlerrm like 'not enrolled%' then
        raise notice 'TEST 1 PASS — non-enrolled create rejected (%)', sqlerrm;
      else
        raise notice 'TEST 1 FAIL — expected "not enrolled…", got: %', sqlerrm;
      end if;
  end;

  -- ================= Test 2: second-team create rejected =================
  -- Fixture: a throwaway one-member team so v_sid[1] already has a team
  -- in this section before we ask create_team to give them a second one.
  insert into teams (id, section_id, name, captain_id, status)
  values ('5eedc0de-0000-4000-a000-00000000ff01', c_section, 'Verify Fixture — Already Teamed', v_sid[1], 'forming');
  insert into team_members (team_id, student_id) values ('5eedc0de-0000-4000-a000-00000000ff01', v_sid[1]);

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_sid[1])::text, true);
    v_result := create_team(c_section, 'Second Team Attempt');
    raise exception 'SELF-CHECK-FAIL: create_team unexpectedly succeeded for an already-teamed caller';
  exception
    when others then
      if sqlerrm like 'already on a team%' then
        raise notice 'TEST 2 PASS — second-team create rejected (%)', sqlerrm;
      else
        raise notice 'TEST 2 FAIL — expected "already on a team…", got: %', sqlerrm;
      end if;
  end;

  -- ================= Test 3: wrong-invitee accept rejected =================
  -- Fixture: a throwaway forming team + a pending invite addressed to
  -- v_sid[3]. v_sid[4] (not the invitee) tries to accept it.
  insert into teams (id, section_id, name, captain_id, status)
  values ('5eedc0de-0000-4000-a000-00000000ff02', c_section, 'Verify Fixture — Wrong Invitee', v_sid[2], 'forming');
  insert into team_invites (id, team_id, invitee_id, status)
  values ('5eedc0de-0000-4000-a000-00000000ff03', '5eedc0de-0000-4000-a000-00000000ff02', v_sid[3], 'pending');

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_sid[4])::text, true);
    perform respond_to_team_invite('5eedc0de-0000-4000-a000-00000000ff03', true);
    raise exception 'SELF-CHECK-FAIL: respond_to_team_invite unexpectedly succeeded for the wrong invitee';
  exception
    when others then
      if sqlerrm like 'not your invite%' then
        raise notice 'TEST 3 PASS — wrong-invitee accept rejected (%)', sqlerrm;
      else
        raise notice 'TEST 3 FAIL — expected "not your invite…", got: %', sqlerrm;
      end if;
  end;

  -- ================= Test 4: accept-on-full-team rejected =================
  -- Fixture: a forming team already at team_size (3) with a dangling
  -- extra pending invite — the "lock step got skipped" edge case the
  -- 0012 header comment calls out. v_sid[8] tries to accept it.
  insert into teams (id, section_id, name, captain_id, status)
  values ('5eedc0de-0000-4000-a000-00000000ff04', c_section, 'Verify Fixture — Already Full', v_sid[5], 'forming');
  insert into team_members (team_id, student_id) values
    ('5eedc0de-0000-4000-a000-00000000ff04', v_sid[5]),
    ('5eedc0de-0000-4000-a000-00000000ff04', v_sid[6]),
    ('5eedc0de-0000-4000-a000-00000000ff04', v_sid[7]);
  insert into team_invites (id, team_id, invitee_id, status)
  values ('5eedc0de-0000-4000-a000-00000000ff05', '5eedc0de-0000-4000-a000-00000000ff04', v_sid[8], 'pending');

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_sid[8])::text, true);
    perform respond_to_team_invite('5eedc0de-0000-4000-a000-00000000ff05', true);
    raise exception 'SELF-CHECK-FAIL: respond_to_team_invite unexpectedly succeeded on a full team';
  exception
    when others then
      if sqlerrm like 'this team is already full%' then
        raise notice 'TEST 4 PASS — accept-on-full-team rejected (%)', sqlerrm;
      else
        raise notice 'TEST 4 FAIL — expected "this team is already full…", got: %', sqlerrm;
      end if;
  end;

  -- ================= cleanup + restore =================
  delete from team_invites where id in (
    '5eedc0de-0000-4000-a000-00000000ff03', '5eedc0de-0000-4000-a000-00000000ff05'
  );
  delete from team_members where team_id in (
    '5eedc0de-0000-4000-a000-00000000ff01', '5eedc0de-0000-4000-a000-00000000ff02', '5eedc0de-0000-4000-a000-00000000ff04'
  );
  delete from teams where id in (
    '5eedc0de-0000-4000-a000-00000000ff01', '5eedc0de-0000-4000-a000-00000000ff02', '5eedc0de-0000-4000-a000-00000000ff04'
  );
  update sections set team_unlock_week = v_orig_unlock, team_formation_deadline = v_orig_deadline
  where id = c_section;

  raise notice 'Verification complete — fixtures cleaned up, section team_unlock_week/team_formation_deadline restored to % / %.', v_orig_unlock, v_orig_deadline;
end $$;

-- ============================================================
-- OPTIONAL — two-concurrent-accepts race, not automated above (a
-- single SQL editor session executes statements serially; there's no
-- way to force real concurrency from one `do $$ ... $$` block). If you
-- want to see the `for update` lock actually serialize two racing
-- accepts rather than just trust the code review:
--
--   1. Run this fixture (creates a 'forming' team at 2/3 with one
--      pending invite — the LAST open seat two people will race for):
--
--        insert into teams (id, section_id, name, captain_id, status)
--        values ('5eedc0de-0000-4000-a000-00000000ff06', '5eedc0de-0000-4000-a000-000000005ec1',
--                'Verify Fixture — Race', '5eedc0de-0000-4000-a000-000000000001', 'forming');
--        insert into team_members (team_id, student_id) values
--          ('5eedc0de-0000-4000-a000-00000000ff06', '5eedc0de-0000-4000-a000-000000000001'),
--          ('5eedc0de-0000-4000-a000-00000000ff06', '5eedc0de-0000-4000-a000-000000000002');
--        insert into team_invites (id, team_id, invitee_id, status) values
--          ('5eedc0de-0000-4000-a000-00000000ff07', '5eedc0de-0000-4000-a000-00000000ff06',
--           '5eedc0de-0000-4000-a000-000000000003', 'pending');
--        -- only ONE invite exists here on purpose — the real race is two
--        -- DIFFERENT invitees for the same last seat, which needs a
--        -- second invite too:
--        insert into team_invites (id, team_id, invitee_id, status) values
--          ('5eedc0de-0000-4000-a000-00000000ff08', '5eedc0de-0000-4000-a000-00000000ff06',
--           '5eedc0de-0000-4000-a000-000000000004', 'pending');
--
--   2. Open TWO separate SQL editor tabs. In tab A, paste and get ready
--      (don't run yet):
--        select set_config('request.jwt.claims', '{"sub":"5eedc0de-0000-4000-a000-000000000003"}', true);
--        select respond_to_team_invite('5eedc0de-0000-4000-a000-00000000ff07', true);
--      In tab B:
--        select set_config('request.jwt.claims', '{"sub":"5eedc0de-0000-4000-a000-000000000004"}', true);
--        select respond_to_team_invite('5eedc0de-0000-4000-a000-00000000ff08', true);
--   3. Run tab A then IMMEDIATELY tab B (or use two people, one on each
--      tab, on a three-count). One should succeed; the other should
--      error with "this team is already full" — never both succeeding
--      (that would mean the team went to 4/3, the exact bug the FOR
--      UPDATE lock on the team row exists to prevent). The dashboard's
--      per-tab sessions are separate Postgres connections, so this is a
--      genuine concurrency test, not simulated.
--   4. Cleanup:
--        delete from team_invites where id in ('5eedc0de-0000-4000-a000-00000000ff07','5eedc0de-0000-4000-a000-00000000ff08');
--        delete from team_members where team_id = '5eedc0de-0000-4000-a000-00000000ff06';
--        delete from teams where id = '5eedc0de-0000-4000-a000-00000000ff06';
--
-- If this feels like more setup than it's worth, skip it — the FOR
-- UPDATE row lock on `teams` in respond_to_team_invite is a standard,
-- well-understood Postgres guarantee (a second transaction blocks on
-- the locked row until the first commits, then re-reads the now-
-- updated member count under its own snapshot), not a novel mechanism
-- this project is trusting blind.
-- ============================================================
