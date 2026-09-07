import { supabase } from './supabaseClient'

export async function listCourses() {
  const { data, error } = await supabase.from('courses').select('*').order('code')
  if (error) throw error
  return data
}

export async function createCourse({ code, name }) {
  const { data, error } = await supabase
    .from('courses')
    .insert({ code, name })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listTerms() {
  const { data, error } = await supabase.from('terms').select('*').order('week1_start')
  if (error) throw error
  return data
}

export async function createTerm({ name, season_label, week1_start, weeks_total }) {
  const { data, error } = await supabase
    .from('terms')
    .insert({ name, season_label, week1_start, weeks_total })
    .select()
    .single()
  if (error) throw error
  return data
}

// Term length/anchor for a section — needed to zero-fill the weekly
// participation chart across the full term, not just weeks with events.
export async function getSectionTerm(sectionId) {
  const { data, error } = await supabase
    .from('sections')
    .select('terms(week1_start, weeks_total)')
    .eq('id', sectionId)
    .single()
  if (error) throw error
  return data.terms
}

export async function listMySections(instructorId) {
  const { data, error } = await supabase
    .from('sections')
    .select('*, courses(code, name), terms(name, season_label)')
    .eq('instructor_id', instructorId)
    .order('code')
  if (error) throw error
  return data
}

export async function createSection({ course_id, term_id, code, instructor_id }) {
  const { data, error } = await supabase
    .from('sections')
    .insert({ course_id, term_id, code, instructor_id })
    .select('*, courses(code, name), terms(name, season_label)')
    .single()
  if (error) throw error
  // P8: generate the section's cycles immediately via the maintenance
  // entry point (generation is its first job; the others no-op on a
  // fresh section). Failure is non-fatal — the nightly cron and the
  // lazy dashboard call self-heal a cycle-less section.
  const { error: maintErr } = await supabase.rpc('run_section_maintenance', { p_section: data.id })
  if (maintErr) console.warn('cycle generation deferred to maintenance:', maintErr.message)
  return data
}

export async function listEnrollments(sectionId) {
  const { data, error } = await supabase
    .from('enrollments')
    .select('*, profiles(full_name, ccid)')
    .eq('section_id', sectionId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function listPendingEnrollments(sectionId) {
  const { data, error } = await supabase
    .from('pending_enrollments')
    .select('*')
    .eq('section_id', sectionId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function addPendingEnrollment(sectionId, ccid, fullName) {
  const { data, error } = await supabase.rpc('add_pending_enrollment', {
    p_section: sectionId,
    p_ccid: ccid,
    p_full_name: fullName,
  })
  if (error) throw error
  return data
}

export async function deletePendingEnrollment(id) {
  const { error } = await supabase.from('pending_enrollments').delete().eq('id', id)
  if (error) throw error
}

export async function fetchPendingClaims(sectionId) {
  const { data, error } = await supabase
    .from('claims')
    .select('id, activity_type_id, lecture_date, description, computed_points, created_at, profiles(full_name, ccid), activity_types(label)')
    .eq('section_id', sectionId)
    .eq('status', 'pending')
    .order('created_at')
  if (error) throw error
  return data
}

// reviewed_by/reviewed_at are stamped server-side from auth.uid() — never
// passed as a parameter (see supabase/migrations/0007_claims_submission.sql).
export async function approveClaim(claimId, override = null) {
  const { error } = await supabase.rpc('approve_claim', { p_claim: claimId, p_override: override })
  if (error) throw error
}

export async function rejectClaim(claimId) {
  const { error } = await supabase.rpc('reject_claim', { p_claim: claimId })
  if (error) throw error
}

export async function grantPoints(sectionId, studentId, points, reason, activityTypeId = 'discussion') {
  const { error } = await supabase.rpc('grant_points', {
    p_section: sectionId,
    p_student: studentId,
    p_points: points,
    p_reason: reason,
    p_activity: activityTypeId,
  })
  if (error) throw error
}

// rows: [{ ccid, fullName, sectionId }]. Atomic on the server (see
// supabase/migrations/0008_bulk_pending_enrollments.sql): either every row
// lands or none do, and the returned summary says which.
export async function bulkAddPendingEnrollments(rows) {
  const { data, error } = await supabase.rpc('bulk_add_pending_enrollments', {
    p_rows: rows.map((r) => ({ ccid: r.ccid, full_name: r.fullName, section_id: r.sectionId })),
  })
  if (error) throw error
  return data
}

export async function listPayoutCurves(sectionId) {
  const { data, error } = await supabase
    .from('payout_curves')
    .select('*')
    .eq('section_id', sectionId)
    .order('name')
  if (error) throw error
  return data
}

export async function createPayoutCurve(sectionId, curve) {
  const { data, error } = await supabase
    .from('payout_curves')
    .insert({ section_id: sectionId, ...curve })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePayoutCurve(curveId, curve) {
  const { data, error } = await supabase
    .from('payout_curves')
    .update(curve)
    .eq('id', curveId)
    .select()
    .single()
  if (error) throw error
  return data
}

// Atomic clear-old/set-new (see supabase/migrations/0009_set_wuclap_default_curve.sql)
// — never choreograph this as two separate .update() calls (CLAUDE.md rule 7).
export async function setWuclapDefaultCurve(curveId) {
  const { data, error } = await supabase.rpc('set_wuclap_default_curve', { p_curve: curveId })
  if (error) throw error
  return data
}

// sourceFilter (optional): 'wuclap' | 'game_upload' — lets the GAMES tab
// show only game-sourced sets while RESULTS keeps showing everything.
export async function listResultSets(sectionId, sourceFilter = null) {
  let query = supabase
    .from('result_sets')
    .select('*, profiles(full_name)')
    .eq('section_id', sectionId)
    .order('uploaded_at', { ascending: false })
  if (sourceFilter) query = query.eq('source', sourceFilter)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getResultSetRows(resultSetId) {
  const { data, error } = await supabase
    .from('result_rows')
    .select('*, profiles(full_name, ccid)')
    .eq('result_set_id', resultSetId)
    .order('rank', { nullsFirst: false })
  if (error) throw error
  return data
}

// Net points per student for this set: for a posted-and-not-voided set this
// is just the awarded amount; for a voided set the compensating negative
// event nets to zero, which is the honest post-void picture. void_result_set
// posts its compensating row as source_kind='adjustment' (not 'result_set') —
// source_id alone is the right scope here, it's specific to this one set.
export async function getResultSetPointEvents(resultSetId) {
  const { data, error } = await supabase
    .from('point_events')
    .select('student_id, points')
    .eq('source_id', resultSetId)
  if (error) throw error
  return data
}

export async function voidResultSet(resultSetId) {
  const { data, error } = await supabase.rpc('void_result_set', { p_result_set: resultSetId })
  if (error) throw error
  return data
}

// Direct table writes (RLS-scoped to the instructor's own section, same
// pattern as claim_rules/payout_curves) — not point_events, so no RPC is
// required here. Posting itself only happens via postResultSet below.
export async function createResultSet(sectionId, { source, gameId = null, label, payoutCurveId, fileName, uploadedBy }) {
  const { data, error } = await supabase
    .from('result_sets')
    .insert({
      section_id: sectionId,
      source,
      game_id: gameId,
      label,
      payout_curve_id: payoutCurveId,
      file_name: fileName,
      uploaded_by: uploadedBy,
      status: 'parsed',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// rows: [{ ccid, student_id, rank, raw_score }]
export async function insertResultRows(resultSetId, rows) {
  const { error } = await supabase.from('result_rows').insert(
    rows.map((r) => ({
      result_set_id: resultSetId,
      ccid: r.ccid,
      student_id: r.student_id,
      rank: r.rank,
      raw_score: r.raw_score,
    }))
  )
  if (error) throw error
}

export async function postResultSet(resultSetId) {
  const { data, error } = await supabase.rpc('post_result_set', { p_result_set: resultSetId })
  if (error) throw error
  return data
}

// Games (P7). Plain table ops, same pattern as payout_curves — RLS
// (p_g_write: is_instructor_of) is the backstop, no cross-row invariant to
// protect here so no RPC is needed (contrast set_wuclap_default_curve).
export async function listGames(sectionId) {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('section_id', sectionId)
    .order('matchday')
  if (error) throw error
  return data
}

export async function createGame(sectionId, game) {
  const { data, error } = await supabase
    .from('games')
    .insert({ section_id: sectionId, ...game })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateGame(gameId, game) {
  const { data, error } = await supabase
    .from('games')
    .update(game)
    .eq('id', gameId)
    .select()
    .single()
  if (error) throw error
  return data
}

// Gradebook (P10, data model §9). Same shape/rationale as
// createResultSet/insertResultRows above: plain table writes under RLS
// (is_instructor_of), no RPC — there's no ledger write and no cross-row
// invariant here, just an upload row + its N grade rows.
export async function listGradebookUploads(sectionId) {
  const { data, error } = await supabase
    .from('gradebook_uploads')
    .select('*, profiles(full_name)')
    .eq('section_id', sectionId)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createGradebookUpload(sectionId, { fileName, uploadedBy, isBaseline = false }) {
  const { data, error } = await supabase
    .from('gradebook_uploads')
    .insert({ section_id: sectionId, file_name: fileName, uploaded_by: uploadedBy, is_baseline: isBaseline })
    .select()
    .single()
  if (error) throw error
  return data
}

// rows: [{ ccid, student_id, finalGrade, letterGrade }]
export async function insertGradebookRows(uploadId, rows) {
  const { error } = await supabase.from('gradebook_rows').insert(
    rows.map((r) => ({
      gradebook_upload_id: uploadId,
      ccid: r.ccid,
      student_id: r.student_id,
      final_grade: r.finalGrade,
      letter_grade: r.letterGrade,
    }))
  )
  if (error) throw error
}

// Lightweight per-upload { matched, total } counts, one query for every
// upload in the list — powers the "N of M matched" summary in
// GradebookUploadHistory's collapsed header without fetching full row
// detail (name/grade joins) for uploads the instructor hasn't opened.
export async function getGradebookMatchCounts(uploadIds) {
  if (uploadIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('gradebook_rows')
    .select('gradebook_upload_id, student_id')
    .in('gradebook_upload_id', uploadIds)
  if (error) throw error
  const counts = new Map()
  for (const row of data) {
    const c = counts.get(row.gradebook_upload_id) ?? { matched: 0, total: 0 }
    c.total += 1
    if (row.student_id != null) c.matched += 1
    counts.set(row.gradebook_upload_id, c)
  }
  return counts
}

export async function getGradebookRows(uploadId) {
  const { data, error } = await supabase
    .from('gradebook_rows')
    .select('*, profiles(full_name, ccid)')
    .eq('gradebook_upload_id', uploadId)
    .order('ccid')
  if (error) throw error
  return data
}

// Not a ledger table — a plain delete (RLS-scoped) is the correct way to
// retract a bad upload; cascades to its gradebook_rows.
export async function deleteGradebookUpload(uploadId) {
  const { error } = await supabase.from('gradebook_uploads').delete().eq('id', uploadId)
  if (error) throw error
}

// Teams (P9, data model §8). Read-only here — instructor write access
// (p_teams_instructor) exists in RLS but no admin UI edits team rows
// yet; this powers the P8 D2 obligation ("surface incomplete teams to
// the instructor") plus a general roster view.
export async function listSectionTeams(sectionId) {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, captain_id, status, locked_at, created_at, team_members(student_id, joined_at, profiles(full_name, ccid))')
    .eq('section_id', sectionId)
    .order('created_at')
  if (error) throw error
  return data
}
