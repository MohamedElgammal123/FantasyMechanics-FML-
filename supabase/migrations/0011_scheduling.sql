-- ============================================================
-- P8: scheduling — cycle generation/finalization, weekly rank
-- snapshots, formation-deadline expiry. SQL mirrors of
-- src/engine/schedule.js; the parity harness pins the two against
-- each other on a live DB before anything consumes the output.
--
-- Invocation model (one code path, three triggers):
--   * pg_cron daily 00:05 UTC → run_all_sections_maintenance()
--   * lazy dashboard call     → run_section_maintenance(section)
--   * tests/parity            → either
--
-- Concurrency: every job takes pg_advisory_xact_lock(hash(section,
-- job)) — concurrent invocations serialize per section; the second
-- entrant then sees the guards already applied (finalized_at set,
-- snapshot rows present, no pending invites / forming teams) and
-- no-ops cleanly. Never errors, so the orchestrator's other jobs
-- always run.
--
-- Idempotency: each job is a pure function of (ledger, config, now)
-- behind a guard predicate — re-runnable from any state. Closed
-- weeks are frozen because point_events.week_number is stamped from
-- now() at insert; late events land in the current week, never the
-- past. Due-checks compare raw instants (week1_start + n weeks of
-- epoch seconds), never clamped week numbers.
-- ============================================================

-- Exclusive end instant of week n: week1_start + n*604800 s.
-- Same epoch arithmetic as week_number_for / JS weekEndDate.
create or replace function week_end_instant(p_section uuid, p_week int)
returns timestamptz language sql stable as $$
  select t.week1_start::timestamptz + make_interval(secs => p_week * 604800)
  from sections s join terms t on t.id = s.term_id
  where s.id = p_section
$$;

-- ---------- cycle generation ----------
-- floor(weeks_total/2) cycles of (2k-1, 2k); odd tail week uncycled
-- (approved D1). ON CONFLICT DO NOTHING: never touches existing rows,
-- so it doubles as the self-heal for sections created before P8.
create or replace function generate_section_cycles(p_section uuid)
returns int language plpgsql security definer as $$
declare v_weeks int; n int := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_section::text || ':cycles', 0));

  select t.weeks_total into v_weeks
  from sections s join terms t on t.id = s.term_id where s.id = p_section;
  if v_weeks is null then raise exception 'unknown section %', p_section; end if;

  insert into cycles (section_id, number, week_start, week_end)
  select p_section, k, 2 * k - 1, 2 * k
  from generate_series(1, v_weeks / 2) as k
  on conflict (section_id, number) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- weekly rank snapshots ----------
-- For each completed week (now() >= end instant, inclusive) with NO
-- rows at all: season ranks over events with week_number <= w.
-- Week-granular first-writer-wins guard — a partially populated week
-- (hand-seeded) counts as present and is never spliced into.
-- Mirrors snapshotForWeek: rank() over sum(points) desc = the
-- competition ranking of seasonRanks.
create or replace function snapshot_completed_weeks(p_section uuid)
returns int language plpgsql security definer as $$
declare v_weeks int; w int; v_rows int; v_total int := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_section::text || ':snapshots', 0));

  select t.weeks_total into v_weeks
  from sections s join terms t on t.id = s.term_id where s.id = p_section;
  if v_weeks is null then raise exception 'unknown section %', p_section; end if;

  for w in 1..v_weeks loop
    exit when now() < week_end_instant(p_section, w);
    continue when exists (
      select 1 from rank_snapshots rs
      where rs.section_id = p_section and rs.week_number = w
    );

    insert into rank_snapshots (section_id, student_id, week_number, rank, total_points)
    select p_section, pe.student_id, w,
           (rank() over (order by sum(pe.points) desc))::int,
           sum(pe.points)::int
    from point_events pe
    where pe.section_id = p_section and pe.week_number <= w
    group by pe.student_id;

    get diagnostics v_rows = row_count;
    v_total := v_total + v_rows;
  end loop;
  return v_total;
end $$;

-- ---------- cycle finalization: one-way latch ----------
-- Due when finalized_at IS NULL and now() >= end instant (inclusive).
-- Every rank-1 row becomes a champion (ties = co-champions); a
-- zero-event cycle finalizes with zero champion rows (approved D4).
-- finalized_at set = never re-evaluated: later voids adjust season
-- totals but never reopen a crown.
create or replace function finalize_due_cycles(p_section uuid)
returns int language plpgsql security definer as $$
declare cy record; n int := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_section::text || ':finalize', 0));

  for cy in
    select id, week_start, week_end from cycles
    where section_id = p_section and finalized_at is null
      and now() >= week_end_instant(p_section, week_end)
    order by number
  loop
    insert into cycle_champions (cycle_id, student_id, points)
    select cy.id, ranked.student_id, ranked.total
    from (
      select pe.student_id, sum(pe.points)::int as total,
             rank() over (order by sum(pe.points) desc) as rnk
      from point_events pe
      where pe.section_id = p_section
        and pe.week_number between cy.week_start and cy.week_end
      group by pe.student_id
    ) ranked
    where ranked.rnk = 1;

    update cycles set finalized_at = now() where id = cy.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- formation-deadline expiry ----------
-- SQL mirror of planFormationExpiry (approved D2/D3), one transaction:
--   1. pending invites -> expired
--   2. forming teams at team_size -> locked
--   3. pool = enrolled, unteamed (ccid order)
--   4. fill under-sized forming teams (created_at order), KEEPING
--      name and captain -> auto_grouped at size, incomplete otherwise
--   5. remaining pool -> new "Team N" teams; final short chunk (even
--      one student) -> incomplete. Teams are never oversized.
-- After one successful run no pending invites or forming teams remain,
-- so every re-run is a structural no-op.
create or replace function expire_team_formation(p_section uuid)
returns void language plpgsql security definer as $$
declare
  v_deadline timestamptz; v_team_size int;
  v_pool uuid[]; v_chunk uuid[]; v_team record; v_new_team uuid;
  v_deficit int; v_filled int; v_n int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_section::text || ':formation', 0));

  select team_formation_deadline, team_size into v_deadline, v_team_size
  from sections where id = p_section;
  if v_deadline is null or now() < v_deadline then return; end if;

  -- 1. only pending flips; accepted/declined/cancelled untouched
  update team_invites ti set status = 'expired'
  from teams t
  where ti.team_id = t.id and t.section_id = p_section and ti.status = 'pending';

  -- 2. full forming teams lock (locked_at = now(): audit truth of when
  -- it actually happened — the run may legitimately be late)
  update teams t set status = 'locked', locked_at = now()
  where t.section_id = p_section and t.status = 'forming'
    and (select count(*) from team_members tm where tm.team_id = t.id) >= v_team_size;

  -- 3. pool: enrolled students on no team, ccid ascending
  select coalesce(array_agg(e.student_id order by p.ccid), '{}') into v_pool
  from enrollments e join profiles p on p.id = e.student_id
  where e.section_id = p_section
    and not exists (
      select 1 from team_members tm join teams t on t.id = tm.team_id
      where t.section_id = p_section and tm.student_id = e.student_id
    );

  -- 4. fill under-sized forming teams; name and captain untouched (D2)
  for v_team in
    select t.id from teams t
    where t.section_id = p_section and t.status = 'forming'
    order by t.created_at, t.id
  loop
    select v_team_size - count(*) into v_deficit
    from team_members where team_id = v_team.id;
    v_filled := least(v_deficit, coalesce(array_length(v_pool, 1), 0));
    if v_filled > 0 then
      insert into team_members (team_id, student_id)
      select v_team.id, unnest(v_pool[1:v_filled]);
      v_pool := v_pool[v_filled + 1:];
    end if;
    update teams
    set status = case when v_deficit - v_filled <= 0
                      then 'auto_grouped'::team_status
                      else 'incomplete'::team_status end
    where id = v_team.id;
  end loop;

  -- 5. remaining pool -> "Team N" (N continues from the section's team
  -- count); final short chunk -> incomplete, never oversized (D3)
  select count(*) into v_n from teams where section_id = p_section;
  while coalesce(array_length(v_pool, 1), 0) > 0 loop
    v_chunk := v_pool[1:v_team_size];
    v_pool := v_pool[v_team_size + 1:];
    v_n := v_n + 1;
    insert into teams (section_id, name, captain_id, status)
    values (p_section, 'Team ' || v_n, v_chunk[1],
            case when array_length(v_chunk, 1) >= v_team_size
                 then 'auto_grouped'::team_status
                 else 'incomplete'::team_status end)
    returning id into v_new_team;
    insert into team_members (team_id, student_id)
    select v_new_team, unnest(v_chunk);
  end loop;
end $$;

-- ---------- orchestrator ----------
-- The single client-facing entry point (lazy dashboard call fires it
-- when the engine detects due work; createSection wiring calls it to
-- generate cycles). Membership-gated for client calls; cron calls
-- arrive with auth.uid() null and skip the gate.
create or replace function run_section_maintenance(p_section uuid)
returns jsonb language plpgsql security definer as $$
declare v_cycles int; v_snaps int; v_final int;
begin
  if not exists (select 1 from sections where id = p_section) then
    raise exception 'unknown section %', p_section;
  end if;
  if auth.uid() is not null
     and not (is_enrolled(p_section) or is_instructor_of(p_section)) then
    raise exception 'not a member of this section';
  end if;

  v_cycles := generate_section_cycles(p_section);
  v_snaps  := snapshot_completed_weeks(p_section);
  v_final  := finalize_due_cycles(p_section);
  perform expire_team_formation(p_section);

  return jsonb_build_object(
    'cycles_created', v_cycles,
    'snapshot_rows', v_snaps,
    'cycles_finalized', v_final
  );
end $$;

-- Cron entry point. One section's failure must never abort the rest:
-- each section runs in its own subtransaction.
create or replace function run_all_sections_maintenance()
returns void language plpgsql security definer as $$
declare s record;
begin
  for s in select id from sections loop
    begin
      perform run_section_maintenance(s.id);
    exception when others then
      raise warning 'maintenance failed for section %: %', s.id, sqlerrm;
    end;
  end loop;
end $$;

-- ---------- grants ----------
-- Clients get exactly one entry point: run_section_maintenance.
-- The job functions and the cron loop are internal (definer-only).
revoke execute on function generate_section_cycles(uuid) from public;
revoke execute on function snapshot_completed_weeks(uuid) from public;
revoke execute on function finalize_due_cycles(uuid) from public;
revoke execute on function expire_team_formation(uuid) from public;
revoke execute on function run_all_sections_maintenance() from public;
revoke execute on function run_section_maintenance(uuid) from public;
grant execute on function run_section_maintenance(uuid) to authenticated;

-- ---------- pg_cron registration ----------
-- Daily 00:05 UTC: every boundary in the system is a midnight-UTC
-- instant, so the timer trails each by at most five minutes. Guarded so
-- environments without pg_cron (some local setups) still migrate; the
-- lazy dashboard call is the self-heal there and after project pauses.
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists (select 1 from cron.job where jobname = 'fml-maintenance') then
      perform cron.unschedule('fml-maintenance');
    end if;
    perform cron.schedule('fml-maintenance', '5 0 * * *',
                          'select public.run_all_sections_maintenance()');
  end if;
end $do$;
