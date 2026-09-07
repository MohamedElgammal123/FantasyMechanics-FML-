-- ============================================================
-- P7: let enrolled students SELECT their own section's result_sets.
--
-- Existing policy `p_rsets` (0001) is `for all using (is_instructor_of(...))`
-- — instructor-only for every command, including SELECT. The games hub
-- needs students to know whether a game's result set has been posted (to
-- derive closed_scored vs closed_awaiting — see src/engine/games.js) and
-- to attribute a winner, without a new client-side RPC per read.
--
-- Scope, per data model §10 ("students may NOT read: ... result_rows raw
-- scores" — result_sets is not on that list): this policy exposes only
-- result_sets columns (id, section_id, source, game_id, label,
-- payout_curve_id, uploaded_by, uploaded_at, file_name, status) — no raw
-- scores or ranks. `result_rows` (where raw_score and rank actually live)
-- keeps its existing instructor-only `p_rrows` policy, completely
-- untouched by this migration. The winner name itself is derived
-- client-side from `point_events` (already section-readable via
-- `p_pe_read`), not from result_rows.
--
-- Permissive policies on the same command OR together, so this coexists
-- with `p_rsets` (which still grants instructors full read/write) without
-- changing instructor behavior at all.
-- ============================================================

create policy p_rsets_student_read on result_sets
  for select using (is_enrolled(section_id));
