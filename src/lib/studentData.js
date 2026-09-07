import { supabase } from './supabaseClient'

// All queries scope by section_id (RLS is the backstop, not the only check).
// No math here and none in the screens — aggregation lives in src/engine/.

export async function listMyEnrollments(studentId) {
  const { data, error } = await supabase
    .from('enrollments')
    .select('section_id, sections(id, code, team_unlock_week, team_formation_deadline, team_size, team_scoring_mode, weekly_claim_cap, courses(code, name), terms(season_label, week1_start, weeks_total))')
    .eq('student_id', studentId)
    .order('created_at')
  if (error) throw error
  return data
}

// Slim ledger columns only: one fetch powers totals, this-week, breakdown,
// live ranks, and cycle standings (all derived via src/engine/aggregate.js).
export async function fetchSectionLedger(sectionId) {
  const { data, error } = await supabase
    .from('point_events')
    .select('student_id, activity_type_id, points, week_number')
    .eq('section_id', sectionId)
  if (error) throw error
  return data
}

export async function fetchActivityTypes() {
  const { data, error } = await supabase
    .from('activity_types')
    .select('id, label, category, scoring')
  if (error) throw error
  return data
}

export async function fetchClaimRules(sectionId) {
  const { data, error } = await supabase
    .from('claim_rules')
    .select('activity_type_id, base_points, escalation_step, escalation_cap')
    .eq('section_id', sectionId)
  if (error) throw error
  return data
}

// Submission is server-authoritative (submit_claim RPC computes
// computed_points + the weekly cap); this preview client only shows the
// student what the engine (src/engine/claims.js) expects the server to say.
export async function submitClaim(sectionId, activityTypeId, lectureDate, description) {
  const { data, error } = await supabase.rpc('submit_claim', {
    p_section: sectionId,
    p_activity: activityTypeId,
    p_lecture_date: lectureDate,
    p_description: description,
  })
  if (error) throw error
  return data
}

// Trend baseline: ranks at the end of the given week (null week → no rows,
// e.g. week 1 has no previous snapshot and gets no arrows).
export async function fetchSnapshots(sectionId, weekNumber) {
  if (!weekNumber || weekNumber < 1) return []
  const { data, error } = await supabase
    .from('rank_snapshots')
    .select('student_id, rank, total_points')
    .eq('section_id', sectionId)
    .eq('week_number', weekNumber)
  if (error) throw error
  return data
}

export async function fetchCycles(sectionId) {
  const { data, error } = await supabase
    .from('cycles')
    .select('id, number, week_start, week_end, finalized_at, cycle_champions(student_id, points, profiles(full_name))')
    .eq('section_id', sectionId)
    .order('number')
  if (error) throw error
  return data
}

export async function fetchMyClaims(sectionId, studentId, limit = 5) {
  const { data, error } = await supabase
    .from('claims')
    .select('id, activity_type_id, lecture_date, description, computed_points, awarded_points, status, week_number, created_at')
    .eq('section_id', sectionId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

export async function fetchMyPendingClaimCount(sectionId, studentId) {
  const { count, error } = await supabase
    .from('claims')
    .select('id', { count: 'exact', head: true })
    .eq('section_id', sectionId)
    .eq('student_id', studentId)
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

// Roster names for leaderboard rows (peer read allowed by RLS).
export async function fetchRoster(sectionId) {
  const { data, error } = await supabase
    .from('enrollments')
    .select('student_id, profiles(full_name)')
    .eq('section_id', sectionId)
  if (error) throw error
  return data
}

// Games whose window contains now — feeds the dashboard hero card only
// (the games hub itself is P7).
export async function fetchOpenGames(sectionId) {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('games')
    .select('id, title, blurb, closes_at')
    .eq('section_id', sectionId)
    .lte('opens_at', nowIso)
    .gt('closes_at', nowIso)
    .order('closes_at')
  if (error) throw error
  return data
}

// Games hub (P7): the full fixture list. Status (upcoming/open/closed_*) is
// derived on read by src/engine/games.js, not stored or computed here.
export async function fetchAllGames(sectionId) {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('section_id', sectionId)
    .order('matchday')
  if (error) throw error
  return data
}

export async function fetchGameLaunchCounts(gameIds) {
  if (gameIds.length === 0) return new Map()
  const { data, error } = await supabase.from('game_launches').select('game_id').in('game_id', gameIds)
  if (error) throw error
  const counts = new Map()
  data.forEach((row) => counts.set(row.game_id, (counts.get(row.game_id) ?? 0) + 1))
  return counts
}

// Only status + game_id — never result_rows (raw scores/ranks stay
// instructor-only; see supabase/migrations/0010_result_sets_student_read.sql).
export async function fetchPostedGameResultSets(sectionId, gameIds) {
  if (gameIds.length === 0) return []
  const { data, error } = await supabase
    .from('result_sets')
    .select('id, game_id')
    .eq('section_id', sectionId)
    .eq('status', 'posted')
    .in('game_id', gameIds)
  if (error) throw error
  return data
}

// Winner attribution for a closed_scored game card: derived from
// point_events (already section-readable), never result_rows.
export async function fetchPointEventsForSources(sourceIds) {
  if (sourceIds.length === 0) return []
  const { data, error } = await supabase
    .from('point_events')
    .select('student_id, points, source_id')
    .eq('source_kind', 'result_set')
    .in('source_id', sourceIds)
  if (error) throw error
  return data
}

// PLAY action. Dedup on (student_id, game_id) is the table's PK — re-click
// is a harmless no-op via ignoreDuplicates, not an error.
export async function launchGame(studentId, gameId) {
  const { error } = await supabase
    .from('game_launches')
    .upsert({ student_id: studentId, game_id: gameId }, { onConflict: 'student_id,game_id', ignoreDuplicates: true })
  if (error) throw error
}

// ---------------------------------------------------------------
// P9: teams. Fetched section-wide (same "fetch broad, derive in
// src/engine/" philosophy as the rest of this file) — a section's
// full team roster is small (students / team_size rows), so one query
// covers "my team", "the team leaderboard", and "who's already teamed"
// for the search panel without three separate round trips.
// ---------------------------------------------------------------

export async function fetchSectionTeams(sectionId) {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, captain_id, status, locked_at, created_at, team_members(student_id, joined_at)')
    .eq('section_id', sectionId)
  if (error) throw error
  return data
}

// RLS (p_ti_read) already scopes this to invites the caller is entitled
// to see (their own as invitee, or their team's as captain) — the
// team_id list just narrows it to this section's teams.
export async function fetchTeamInvitesForTeams(teamIds) {
  if (teamIds.length === 0) return []
  const { data, error } = await supabase
    .from('team_invites')
    .select('id, team_id, invitee_id, status, sent_at, responded_at')
    .in('team_id', teamIds)
  if (error) throw error
  return data
}

export async function fetchPrizeTiers(sectionId, scope = 'team') {
  const { data, error } = await supabase
    .from('prize_tiers')
    .select('id, name, threshold_points, reward_text')
    .eq('section_id', sectionId)
    .eq('scope', scope)
  if (error) throw error
  return data
}

// Single-row updates below are all plain RLS-scoped writes (captain-only
// via p_teams_captain_upd / p_ti_captain / p_ti_respond, status='forming'
// gated where the policy requires it) — no cross-row invariant, so no RPC
// per CLAUDE.md rule 7. Team CREATION and invite ACCEPTANCE are the two
// exceptions: both need an atomic multi-row transaction (team+first-member;
// invite+team_members+possible auto-lock), served by the SECURITY DEFINER
// functions in supabase/migrations/0012_team_formation_rpcs.sql (applied
// and negative-auth verified on dev, 2026-08-23) — see createTeam /
// acceptTeamInvite at the bottom of this section.

export async function renameTeam(teamId, name) {
  const { error } = await supabase.from('teams').update({ name }).eq('id', teamId)
  if (error) throw error
}

export async function sendTeamInvite(teamId, inviteeId) {
  const { error } = await supabase.from('team_invites').insert({ team_id: teamId, invitee_id: inviteeId })
  if (error) throw error
}

export async function cancelTeamInvite(inviteId) {
  const { error } = await supabase
    .from('team_invites')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', inviteId)
  if (error) throw error
}

export async function resendTeamInvite(inviteId) {
  const { error } = await supabase
    .from('team_invites')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', inviteId)
  if (error) throw error
}

export async function declineTeamInvite(inviteId) {
  const { error } = await supabase
    .from('team_invites')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', inviteId)
  if (error) throw error
}

// Both go through the 0012 RPCs — never choreograph these as separate
// client inserts (CLAUDE.md rule 7); the server functions also re-check
// the unlock/deadline window, enrollment, one-team-per-section, and
// seat count inside the same transaction.
export async function createTeam(sectionId, name) {
  const { data, error } = await supabase.rpc('create_team', {
    p_section: sectionId,
    p_name: name,
  })
  if (error) throw error
  return data
}

export async function acceptTeamInvite(inviteId) {
  const { error } = await supabase.rpc('respond_to_team_invite', {
    p_invite: inviteId,
    p_accept: true,
  })
  if (error) throw error
}
