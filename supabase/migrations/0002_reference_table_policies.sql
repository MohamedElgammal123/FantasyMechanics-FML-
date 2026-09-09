-- Read-only access to reference tables for signed-in users
create policy p_courses_read on courses
  for select using (auth.role() = 'authenticated');

create policy p_terms_read on terms
  for select using (auth.role() = 'authenticated');

create policy p_activity_types_read on activity_types
  for select using (auth.role() = 'authenticated');

-- Instructors can create courses and terms
create policy p_courses_write on courses
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('instructor','admin'))
  );

create policy p_terms_write on terms
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('instructor','admin'))
  );