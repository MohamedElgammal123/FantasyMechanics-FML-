// P9: team formation UI state — pure functions, no React/Supabase.
// Complements src/engine/teams.js (which handles scoring aggregation).
// These cover invite-flow client state: seats math, classmate search
// status, the D2 auto-fill disclosure, and prize-track progress.

// Seats already spoken for = current members + outstanding pending
// invites (a captain shouldn't be able to invite past team_size even
// though the DB doesn't enforce that until accept time — see
// supabase/migrations/0012_team_formation_rpcs.sql).
export function seatsLeft(memberCount, pendingInviteCount, teamSize) {
  return Math.max(0, teamSize - memberCount - pendingInviteCount)
}

// Status of one section classmate in the "find teammates" search panel.
//   'you'         — the viewer themself
//   'teammate'    — already on the viewer's own team
//   'unavailable' — on someone else's team in this section
//   'invited'     — the viewer's team already has a pending invite out to them
//   'invite'      — free to invite
export function classifyClassmate(studentId, {
  viewerId,
  myTeamMemberIds = [],
  teamedStudentIds = [],
  myPendingInviteeIds = [],
}) {
  if (studentId === viewerId) return 'you'
  if (myTeamMemberIds.includes(studentId)) return 'teammate'
  if (myPendingInviteeIds.includes(studentId)) return 'invited'
  if (teamedStudentIds.includes(studentId)) return 'unavailable'
  return 'invite'
}

// D2 disclosure: was this member placed by the deadline-expiry auto-fill
// rather than by accepting an invite themselves? joined_at is stamped by
// either an accepted invite (student's own action, before the deadline)
// or expire_team_formation's fill/new-team insert (at-or-after the
// deadline instant). >= matches formationExpiryDue's own inclusive check.
export function wasAutoFilled(joinedAt, formationDeadline) {
  if (formationDeadline == null || joinedAt == null) return false
  return Date.parse(joinedAt) >= Date.parse(formationDeadline)
}

// Prize track progress (design screens 2b): tiers sorted ascending by
// threshold, each flagged reached/not, plus the next unreached tier and
// a 0-1 progress fraction toward it (clamped; null tiers → 0 with no
// next tier, an honest empty state rather than a fake full bar).
export function prizeProgress(points, tiers) {
  const sorted = [...tiers].sort((a, b) => a.threshold_points - b.threshold_points)
  const decorated = sorted.map(t => ({ ...t, reached: points >= t.threshold_points }))
  const next = decorated.find(t => !t.reached) ?? null
  const prevThreshold = [...decorated].reverse().find(t => t.reached)?.threshold_points ?? 0
  const pct = next
    ? Math.max(0, Math.min(1, (points - prevThreshold) / (next.threshold_points - prevThreshold)))
    : 1
  return { tiers: decorated, next, pct }
}
