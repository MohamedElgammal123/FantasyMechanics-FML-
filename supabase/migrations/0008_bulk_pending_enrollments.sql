-- ============================================================
-- P6: bulk roster import into pending_enrollments (CSV upload).
-- Companion to add_pending_enrollment (0004), which stays for the
-- one-off "add a test student" form. This is the many-rows path.
--
-- Atomicity: validate-then-write in two passes. Pass 1 checks every
-- row and collects all failures; if any row fails, nothing is ever
-- written and the full error list comes back for the validation UI.
-- Pass 2 only runs once pass 1 found zero errors, so there is no
-- partial-batch state to roll back from.
--
-- Idempotent re-upload: ccid is normalized lower(trim(...)) before
-- matching. An unconsumed row for the same (ccid, section_id) has
-- its name refreshed rather than erroring or duplicating (re-running
-- an updated Canvas export mid-semester is safe). A consumed row
-- (student already linked) is left untouched and reported in
-- skipped_consumed, never overwritten or duplicated.
--
-- Multi-section input: each row carries its own section_id (a
-- roster CSV commonly lists more than one section per student), so
-- is_instructor_of is checked per row rather than once for the call.
-- ============================================================

create or replace function bulk_add_pending_enrollments(p_rows jsonb)
returns jsonb
language plpgsql security definer as $$
declare
  v_row jsonb;
  v_idx int;
  v_ccid text;
  v_full_name text;
  v_section_id uuid;
  v_key text;
  v_seen jsonb := '{}'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped_consumed int := 0;
  v_existing pending_enrollments%rowtype;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows must be a jsonb array';
  end if;

  -- pass 1: validate every row, collect all errors, write nothing yet
  v_idx := 0;
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    v_ccid := lower(trim(coalesce(v_row->>'ccid', '')));
    v_full_name := trim(coalesce(v_row->>'full_name', ''));

    if v_ccid = '' then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'reason', 'ccid is required');
      continue;
    end if;
    if v_full_name = '' then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'reason', 'full_name is required');
      continue;
    end if;

    begin
      v_section_id := (v_row->>'section_id')::uuid;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'reason', 'section_id is missing or not a valid uuid');
      continue;
    end;

    if not is_instructor_of(v_section_id) then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'reason', 'not instructor of this section');
      continue;
    end if;

    v_key := v_ccid || '|' || v_section_id::text;
    if v_seen ? v_key then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'reason', 'duplicate ccid+section in this batch');
      continue;
    end if;
    v_seen := v_seen || jsonb_build_object(v_key, true);
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object(
      'inserted', 0, 'updated', 0, 'skipped_consumed', 0, 'errors', v_errors
    );
  end if;

  -- pass 2: every row validated clean — write them
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_ccid := lower(trim(v_row->>'ccid'));
    v_full_name := trim(v_row->>'full_name');
    v_section_id := (v_row->>'section_id')::uuid;

    select * into v_existing from pending_enrollments
      where ccid = v_ccid and section_id = v_section_id;

    if v_existing.id is null then
      insert into pending_enrollments (ccid, full_name, role, section_id)
      values (v_ccid, v_full_name, 'student', v_section_id);
      v_inserted := v_inserted + 1;
    elsif v_existing.consumed_at is not null then
      v_skipped_consumed := v_skipped_consumed + 1;
    else
      update pending_enrollments set full_name = v_full_name where id = v_existing.id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped_consumed', v_skipped_consumed,
    'errors', '[]'::jsonb
  );
end $$;

revoke execute on function bulk_add_pending_enrollments(jsonb) from public;
grant execute on function bulk_add_pending_enrollments(jsonb) to authenticated;
