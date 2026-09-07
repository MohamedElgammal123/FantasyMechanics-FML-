-- ============================================================
-- P2: let an instructor hand-add a single test student to their
-- section's roster staging table. pending_enrollments has no
-- INSERT policy (0003 reserved writes for a SECURITY DEFINER
-- function) — this is that function. Bulk CSV roster import (P6)
-- gets its own flow; this is for one-off test/demo students.
-- Role is hardcoded 'student': granting instructor power stays
-- exclusively the pending_instructors path (dashboard-only insert).
-- ============================================================

create or replace function add_pending_enrollment(
  p_section uuid, p_ccid text, p_full_name text
) returns pending_enrollments
language plpgsql security definer as $$
declare v_row pending_enrollments%rowtype;
begin
  if not is_instructor_of(p_section) then
    raise exception 'not instructor of this section';
  end if;

  insert into pending_enrollments (ccid, full_name, role, section_id)
  values (lower(trim(p_ccid)), trim(p_full_name), 'student', p_section)
  returning * into v_row;

  return v_row;
end $$;

grant execute on function add_pending_enrollment(uuid, text, text) to authenticated;
