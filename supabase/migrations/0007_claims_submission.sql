-- ============================================================
-- P5: server-authoritative claim submission + RPC hardening
--
-- Two things land together because they're the same integrity gap:
-- 1. `claims.computed_points` was only ever set by whichever client
--    inserted the row (direct RLS insert) — a student could submit
--    any value. submit_claim() is now the only path in.
-- 2. approve_claim / grant_points / post_result_set / void_result_set
--    are SECURITY DEFINER but had no internal authorization check —
--    any authenticated user (student included) could call them
--    directly. Every one below now derives the actor from auth.uid()
--    and verifies is_instructor_of() before acting.
-- ============================================================

-- ---------- claims.week_number (needed for the cap check) ----------
-- Mirrors point_events.week_number: stamped at write time, never
-- recomputed later, so historical cap checks stay stable even if a
-- claim's lecture_date and its submission week diverge.
alter table claims add column week_number int;
update claims set week_number = week_number_for(section_id, created_at) where week_number is null;
alter table claims alter column week_number set not null;

-- ---------- SQL mirror of src/engine/claims.js claimValue ----------
create or replace function claim_escalation_value(p_base int, p_step int, p_cap int, p_nth int)
returns int language sql immutable as $$
  select case
    when p_cap is null then p_base + p_step * (p_nth - 1)
    else least(p_base + p_step * (p_nth - 1), p_cap)
  end
$$;

-- ---------- submit_claim: the only way a claim gets created ----------
-- Recomputes computed_points and the weekly cap server-side; the client
-- preview (same engine functions, run against data it already fetched)
-- is UX only. Serializes per (section, student) with an advisory lock
-- so a double-tap submit can't allocate the same escalation slot twice
-- or blow past the cap via a race.
create or replace function submit_claim(
  p_section uuid, p_activity text, p_lecture_date date, p_description text
) returns claims language plpgsql security definer as $$
declare
  v_student uuid := auth.uid();
  v_rule claim_rules;
  v_week1 date;
  v_weeks_total int;
  v_cap int;
  v_nth int;
  v_value int;
  v_week int;
  v_used int;
  v_desc text := trim(p_description);
  v_claim claims;
begin
  if v_student is null then
    raise exception 'must be authenticated';
  end if;
  if not is_enrolled(p_section) then
    raise exception 'not enrolled in this section';
  end if;
  if v_desc = '' then
    raise exception 'a description is required';
  end if;
  if not exists (select 1 from activity_types where id = p_activity and scoring = 'claim') then
    raise exception 'not a claimable activity';
  end if;

  select t.week1_start, t.weeks_total into v_week1, v_weeks_total
  from sections s join terms t on t.id = s.term_id
  where s.id = p_section;

  if p_lecture_date > current_date then
    raise exception 'lecture date cannot be in the future';
  end if;
  if p_lecture_date < v_week1 or p_lecture_date > (v_week1 + v_weeks_total * interval '7 days')::date then
    raise exception 'lecture date is outside the term';
  end if;

  select * into v_rule from claim_rules
  where section_id = p_section and activity_type_id = p_activity;
  if v_rule is null then
    raise exception 'no claim rule configured for this activity';
  end if;

  -- serialize this student's submissions within this section
  perform pg_advisory_xact_lock(hashtextextended(p_section::text || v_student::text, 0));

  select count(*) + 1 into v_nth from claims
  where section_id = p_section and student_id = v_student
    and activity_type_id = p_activity and lecture_date = p_lecture_date
    and status in ('pending', 'approved');

  v_value := claim_escalation_value(v_rule.base_points, v_rule.escalation_step, v_rule.escalation_cap, v_nth);
  v_week := week_number_for(p_section, now());

  select weekly_claim_cap into v_cap from sections where id = p_section;

  if v_cap is not null then
    select coalesce(sum(case
      when status = 'approved' then coalesce(awarded_points, computed_points)
      else computed_points
    end), 0) into v_used
    from claims
    where section_id = p_section and student_id = v_student
      and week_number = v_week and status in ('pending', 'approved');

    if v_used + v_value > v_cap then
      raise exception 'weekly claim cap reached — resets Monday';
    end if;
  end if;

  insert into claims (section_id, student_id, activity_type_id, lecture_date, description,
                       computed_points, status, week_number)
  values (p_section, v_student, p_activity, p_lecture_date, v_desc, v_value, 'pending', v_week)
  returning * into v_claim;

  return v_claim;
end $$;

-- ---------- reject_claim: symmetric to approve_claim, born hardened ----------
create or replace function reject_claim(p_claim uuid)
returns void language plpgsql security definer as $$
declare cl record; v_actor uuid := auth.uid();
begin
  select * into cl from claims where id = p_claim for update;
  if cl is null then raise exception 'claim not found'; end if;
  if not is_instructor_of(cl.section_id) then
    raise exception 'only the section instructor may reject claims';
  end if;
  if cl.status <> 'pending' then raise exception 'claim is %, not pending', cl.status; end if;

  update claims set status = 'rejected', reviewed_by = v_actor, reviewed_at = now()
  where id = p_claim;
end $$;

-- ---------- approve_claim: reviewer is auth.uid(), never a parameter ----------
drop function if exists approve_claim(uuid, uuid, int);

create or replace function approve_claim(p_claim uuid, p_override int default null)
returns void language plpgsql security definer as $$
declare cl record; v_actor uuid := auth.uid();
begin
  select * into cl from claims where id = p_claim for update;
  if cl is null then raise exception 'claim not found'; end if;
  if not is_instructor_of(cl.section_id) then
    raise exception 'only the section instructor may approve claims';
  end if;
  if cl.status <> 'pending' then raise exception 'claim is %, not pending', cl.status; end if;

  update claims set status = 'approved', awarded_points = p_override,
    reviewed_by = v_actor, reviewed_at = now() where id = p_claim;

  insert into point_events
    (section_id, student_id, activity_type_id, points, source_kind, source_id, occurred_at, week_number)
  values (cl.section_id, cl.student_id, cl.activity_type_id,
          coalesce(p_override, cl.computed_points), 'claim', cl.id,
          now(), week_number_for(cl.section_id, now()));
end $$;

-- ---------- grant_points: instructor derived from auth.uid() ----------
create or replace function grant_points(
  p_section uuid, p_student uuid, p_points int, p_reason text, p_activity text default 'discussion'
) returns void language plpgsql security definer as $$
begin
  if not is_instructor_of(p_section) then
    raise exception 'only the section instructor may grant points';
  end if;
  if not exists (select 1 from enrollments where section_id = p_section and student_id = p_student) then
    raise exception 'student is not enrolled in this section';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required for instructor grants';
  end if;
  insert into point_events
    (section_id, student_id, activity_type_id, points, source_kind, reason, occurred_at, week_number)
  values (p_section, p_student, p_activity, p_points, 'adjustment', p_reason,
          now(), week_number_for(p_section, now()));
end $$;

-- ---------- post_result_set / void_result_set: instructor-only ----------
create or replace function post_result_set(p_result_set uuid)
returns int language plpgsql security definer as $$
declare
  rs record; c record; n int := 0;
begin
  select * into rs from result_sets where id = p_result_set for update;
  if rs is null then raise exception 'result set not found'; end if;
  if not is_instructor_of(rs.section_id) then
    raise exception 'only the section instructor may post result sets';
  end if;
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

create or replace function void_result_set(p_result_set uuid)
returns int language plpgsql security definer as $$
declare rs record; n int := 0;
begin
  select * into rs from result_sets where id = p_result_set for update;
  if rs is null then raise exception 'result set not found'; end if;
  if not is_instructor_of(rs.section_id) then
    raise exception 'only the section instructor may void result sets';
  end if;
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

-- ---------- RLS: submit_claim is now the only insert path ----------
drop policy if exists p_claims_student_ins on claims;

-- ---------- execute grants: authenticated only, never anon/public ----------
revoke execute on function submit_claim(uuid, text, date, text) from public;
revoke execute on function reject_claim(uuid) from public;
revoke execute on function approve_claim(uuid, int) from public;
revoke execute on function grant_points(uuid, uuid, int, text, text) from public;
revoke execute on function post_result_set(uuid) from public;
revoke execute on function void_result_set(uuid) from public;

grant execute on function submit_claim(uuid, text, date, text) to authenticated;
grant execute on function reject_claim(uuid) to authenticated;
grant execute on function approve_claim(uuid, int) to authenticated;
grant execute on function grant_points(uuid, uuid, int, text, text) to authenticated;
grant execute on function post_result_set(uuid) to authenticated;
grant execute on function void_result_set(uuid) to authenticated;
