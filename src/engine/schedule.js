// P8 scheduling: cycle generation/finalization due-checks, snapshot
// backfill detection, team-mode unlock, and the formation-deadline expiry
// planner. Pure functions — no React, no Supabase. Each has a SQL mirror
// in supabase/migrations/0011_scheduling.sql; the parity gate pins the
// two against each other on a live DB.
//
// Due-checks compare raw instants (weekEndDate), never clamped week
// numbers: the clamp exists for event attribution, not scheduling — using
// it here would make the final week look never-complete and pre-term
// instants look due.

import { weekNumberFor, weekEndDate } from './weeks.js'
import { seasonRanks } from './aggregate.js'

function toMs(at) {
  return at instanceof Date ? at.getTime() : Date.parse(at)
}

// floor(weeksTotal/2) cycles of (2k−1, 2k); an odd tail week gets no
// cycle (approved D1 — matches the seed's 6 cycles for a 13-week term).
export function generateCyclePlan(weeksTotal) {
  const plan = []
  for (let k = 1; 2 * k <= weeksTotal; k++) {
    plan.push({ number: k, week_start: 2 * k - 1, week_end: 2 * k })
  }
  return plan
}

// Cycles ready to finalize: past their end boundary (inclusive at the
// instant) and not yet latched. finalized_at set = never returned again,
// no matter how late the run — the one-way latch.
export function dueUnfinalizedCycles(cycles, week1Start, now) {
  const nowMs = toMs(now)
  return cycles.filter(c =>
    c.finalized_at == null && nowMs >= weekEndDate(week1Start, c.week_end).getTime()
  )
}

// Completed weeks with no snapshot rows at all. existingWeeks is the set
// of weeks having ANY rank_snapshots rows — week-granular first-writer-
// wins: a partially populated week (hand-seeded) counts as present and is
// never spliced into.
export function missingSnapshotWeeks(week1Start, weeksTotal, existingWeeks, now) {
  const nowMs = toMs(now)
  const existing = new Set(existingWeeks)
  const missing = []
  for (let w = 1; w <= weeksTotal; w++) {
    if (nowMs < weekEndDate(week1Start, w).getTime()) break
    if (!existing.has(w)) missing.push(w)
  }
  return missing
}

// Season ranks as of the end of the given week: events with
// week_number <= week. Reconstructible at any later time because
// week_number is stamped from now() at insert — closed weeks never gain
// events, so a late run computes the identical history.
export function snapshotForWeek(events, week) {
  return seasonRanks(events.filter(e => e.week_number <= week))
}

// Compute-on-read, no job, no stored state. Inclusive >= at the unlock
// week, matching teamTotals from_unlock semantics. null = team mode off.
export function isTeamModeUnlocked(unlockWeek, week1Start, weeksTotal, now) {
  if (unlockWeek == null) return false
  return weekNumberFor(week1Start, weeksTotal, now) >= unlockWeek
}

// Stored timestamptz vs now, inclusive at the instant. null = no deadline.
export function formationExpiryDue(deadline, now) {
  return deadline != null && toMs(now) >= toMs(deadline)
}

// Formation-deadline expiry plan (approved D2/D3). Deterministic
// throughout — teams by created_at, students by ccid — so a re-run from
// any state converges; applied to its own post-state it plans nothing
// (the engine analog of a concurrent second invocation).
//
// The plan cannot express a name or captain change for an existing team:
// filled teams keep both (D2). Disclosure of auto-fills to the incoming
// student and existing members is a P9 UI obligation (docs §8).
//
//   { expireInviteIds:   pending invite ids → 'expired'
//     lockTeamIds:       forming teams at team_size → 'locked'
//     fills:             [{ team_id, student_id }] pool → under-sized teams
//     teamStatusChanges: [{ team_id, status }] 'auto_grouped' | 'incomplete'
//     newTeams:          [{ name, captain_id, member_ids, status }] }
export function planFormationExpiry({ teamSize, teams, invites, enrolled }) {
  const expireInviteIds = invites.filter(i => i.status === 'pending').map(i => i.id)

  const forming = teams
    .filter(t => t.status === 'forming')
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))

  const lockTeamIds = forming
    .filter(t => t.member_ids.length >= teamSize)
    .map(t => t.id)

  // Pool: enrolled students on no team in the section, ccid ascending.
  const teamed = new Set(teams.flatMap(t => t.member_ids))
  const pool = enrolled
    .filter(s => !teamed.has(s.student_id))
    .sort((a, b) => (a.ccid < b.ccid ? -1 : a.ccid > b.ccid ? 1 : 0))
    .map(s => s.student_id)

  const fills = []
  const teamStatusChanges = []
  for (const t of forming) {
    if (t.member_ids.length >= teamSize) continue // locked above
    let size = t.member_ids.length
    while (size < teamSize && pool.length > 0) {
      fills.push({ team_id: t.id, student_id: pool.shift() })
      size++
    }
    teamStatusChanges.push({
      team_id: t.id,
      status: size >= teamSize ? 'auto_grouped' : 'incomplete',
    })
  }

  // Remaining pool → "Team N" chunks; the final short chunk — even one
  // student — is its own incomplete team, never an oversized one (D3).
  const newTeams = []
  let n = teams.length + 1
  while (pool.length > 0) {
    const member_ids = pool.splice(0, teamSize)
    newTeams.push({
      name: `Team ${n++}`,
      captain_id: member_ids[0],
      member_ids,
      status: member_ids.length >= teamSize ? 'auto_grouped' : 'incomplete',
    })
  }

  return { expireInviteIds, lockTeamIds, fills, teamStatusChanges, newTeams }
}
