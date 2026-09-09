-- ============================================================
-- Allow an instructor to delete a mistyped/unwanted pending_enrollments
-- row for their own section — but only before it's consumed. The
-- "staging rows are never deleted" rule from 0003 is about preserving
-- the audit trail of who has/hasn't logged in; a row that never
-- activated (consumed_at is null) carries no such history yet.
-- ============================================================

create policy p_pending_enrollments_instructor_delete on pending_enrollments
  for delete using (
    consumed_at is null
    and exists (
      select 1 from sections s
      where s.id = pending_enrollments.section_id
        and s.instructor_id = auth.uid()
    )
  );
