-- ============================================================
-- P9: create_team + respond_to_team_invite (SECURITY DEFINER).
-- Drafted as a proposal during the P9 overnight batch (2026-08-18),
-- reviewed and approved by Ahmed the same day with one addition (the
-- two window guards on create_team below). Apply via the dashboard SQL
-- editor, same as every other file in this directory. See NIGHTLOG.md
-- for the full history and the verification script
-- (supabase/verify_0012_team_formation_rpcs.sql) to run right after.
--
-- Why this exists (CLAUDE.md rule 7 — "multi-row invariants are
-- enforced in one transaction, server-side. Never choreograph a
-- sequence of client calls to maintain something like exactly one
-- default row or all-or-nothing across N rows"):
--
-- 1. CREATE A TEAM. A captain creating a team needs TWO rows to land
--    together: the `teams` row and their own `team_members` row (the
--    captain occupies one of the `team_size` seats — see the design
--    screens' "YOUR SQUAD · N SEATS" panel, captain always listed
--    first). Two separate client inserts (teams, then team_members)
--    can't be made atomic from the client: if the second insert fails
--    (network blip, tab closed), the app is left with an orphan
--    `teams` row that has a captain but zero members, and — because
--    the "one team per student" trigger only fires on `team_members`
--    INSERT, not on `teams` INSERT — nothing stops that same captain
--    retrying and creating a SECOND team, doubling the orphan. That's
--    exactly the "exactly one row per captain-in-progress" shape
--    CLAUDE.md rule 7 is about.
--
-- 2. ACCEPT AN INVITE. Accepting needs THREE things to happen
--    together: (a) the invite flips pending -> accepted, (b) a
--    `team_members` row is inserted for the invitee, (c) if that
--    insert brings the team to `team_size`, the team flips
--    forming -> locked. None of this is a trigger today — only
--    `expire_team_formation` (0011_scheduling.sql) ever locks a team,
--    and only at the formation deadline. Two known failure modes if
--    this were choreographed as separate client calls:
--      - invite marked accepted but the team_members insert fails →
--        a phantom "accepted" seat that's occupied by nobody, and the
--        team can never reach team_size through the UI again.
--      - the team fills up but the "lock" step is skipped/fails →
--        the team stays `forming`, so p_ti_captain (which only checks
--        status = 'forming') would still let the captain invite a
--        4th person into a team_size=3 team — "teams are never
--        oversized" (data model §8) is violated.
--    This function also closes a related soft gap: nothing today
--    stops a captain sending more pending invites than there are
--    seats (p_ti_captain only checks the team is 'forming'). Gating
--    the room check at ACCEPT time — inside this one transaction —
--    is the real enforcement boundary regardless of how many invites
--    went out; the UI's own seat counter (src/engine/teamFormation.js
--    seatsLeft) is just a courtesy, not the backstop.
--
-- Everything else P9 needed (rename team, send/cancel/resend an
-- invite, decline an invite) is a single-row write already covered by
-- existing RLS (p_teams_captain_upd, p_ti_captain, p_ti_respond) — no
-- RPC needed there, see src/lib/studentData.js.
-- ============================================================

-- ---------- create_team ----------
-- Atomically: insert the team (captain = auth.uid(), status='forming'),
-- insert the captain as its first member. Guards mirror the existing
-- RLS checks (is_enrolled, one-team-per-section) but raise a friendly
-- error instead of relying on the team_members trigger to catch it
-- after a partial write.
--
-- Review addition (Ahmed, 2026-08-18): the app only ever surfaces the
-- "create a team" control once TeamsPage has already computed
-- isTeamModeUnlocked and the formation deadline hasn't passed — but
-- that's client-side gating, not enforcement. A direct RPC call
-- (curl, browser console, a future caller that forgets the check)
-- could otherwise create a team before the instructor has unlocked
-- team mode at all, or after the deadline expire_team_formation is
-- meant to be the only thing populating rosters past. Both windows are
-- re-checked here, inside the same transaction, using the same
-- week_number_for() the rest of the schema already uses for identical
-- "which week is `now()` in" math (0001_initial_schema.sql) — so this
-- can't drift from isTeamModeUnlocked's own >= boundary.
create or replace function create_team(p_section uuid, p_name text)
returns teams language plpgsql security definer as $$
declare
  v_team teams;
  v_unlock_week int;
  v_deadline timestamptz;
begin
  if not is_enrolled(p_section) then
    raise exception 'not enrolled in this section';
  end if;

  select team_unlock_week, team_formation_deadline into v_unlock_week, v_deadline
  from sections where id = p_section;

  if v_unlock_week is null or week_number_for(p_section, now()) < v_unlock_week then
    raise exception 'team mode is not unlocked for this section yet';
  end if;
  if v_deadline is not null and now() >= v_deadline then
    raise exception 'the team formation deadline has passed';
  end if;

  if exists (
    select 1 from team_members tm join teams t on t.id = tm.team_id
    where t.section_id = p_section and tm.student_id = auth.uid()
  ) then
    raise exception 'already on a team in this section';
  end if;
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'team name is required';
  end if;

  insert into teams (section_id, name, captain_id, status)
  values (p_section, trim(p_name), auth.uid(), 'forming')
  returning * into v_team;

  insert into team_members (team_id, student_id) values (v_team.id, auth.uid());

  return v_team;
end $$;

-- ---------- respond_to_team_invite ----------
-- p_accept = false: single-row decline, kept here only so accept/decline
-- share one entry point from the client — no atomicity need on decline
-- (the client already does this today as a plain update; harmless to
-- fold in once this function exists, not required to fold in).
-- p_accept = true: the atomic path described above. `for update` locks
-- both the invite and the team row so two invitees racing for the last
-- seat serialize instead of both succeeding into an oversized team.
create or replace function respond_to_team_invite(p_invite uuid, p_accept boolean)
returns void language plpgsql security definer as $$
declare
  inv record;
  v_team teams;
  v_size int;
  v_count int;
begin
  select * into inv from team_invites where id = p_invite for update;
  if inv is null then raise exception 'invite not found'; end if;
  if inv.invitee_id <> auth.uid() then raise exception 'not your invite'; end if;
  if inv.status <> 'pending' then raise exception 'invite is %, not pending', inv.status; end if;

  if not p_accept then
    update team_invites set status = 'declined', responded_at = now() where id = p_invite;
    return;
  end if;

  select * into v_team from teams where id = inv.team_id for update;
  if v_team.status <> 'forming' then
    raise exception 'this team is no longer forming (status: %)', v_team.status;
  end if;
  if exists (
    select 1 from team_members tm join teams t on t.id = tm.team_id
    where t.section_id = v_team.section_id and tm.student_id = auth.uid()
  ) then
    raise exception 'already on a team in this section';
  end if;

  select team_size into v_size from sections where id = v_team.section_id;
  select count(*) into v_count from team_members where team_id = v_team.id;
  if v_count >= v_size then
    raise exception 'this team is already full';
  end if;

  update team_invites set status = 'accepted', responded_at = now() where id = p_invite;
  insert into team_members (team_id, student_id) values (v_team.id, auth.uid());

  if v_count + 1 >= v_size then
    update teams set status = 'locked', locked_at = now() where id = v_team.id;
  end if;
end $$;

-- ---------- grants ----------
revoke execute on function create_team(uuid, text) from public;
revoke execute on function respond_to_team_invite(uuid, boolean) from public;
grant execute on function create_team(uuid, text) to authenticated;
grant execute on function respond_to_team_invite(uuid, boolean) to authenticated;
