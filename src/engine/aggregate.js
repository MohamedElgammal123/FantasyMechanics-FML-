// P4 dashboard/leaderboard aggregation over the point_events ledger.
// Pure functions — no React, no Supabase. Screens never sum; they render
// what these return.

import { competitionRanks } from './ranking.js'

// events: [{ student_id, points, ... }] — the section's full ledger.
// Returns [{ student_id, points, rank }] sorted by points descending,
// standard competition ranking. Voids (negative events) net out here;
// totals are ledger truth and are NOT clamped.
export function seasonRanks(events) {
  const totals = new Map()
  for (const e of events) {
    totals.set(e.student_id, (totals.get(e.student_id) ?? 0) + e.points)
  }
  const rows = [...totals].map(([id, score]) => ({ id, score }))
  return competitionRanks(rows).map(r => ({
    student_id: r.id,
    points: r.score,
    rank: r.rank,
  }))
}

// Map of student_id → points summed over the given week only.
// A student with no events that week is ABSENT from the map, not 0 —
// UI consumers must render a missing key as 0 (`weekMap.get(id) ?? 0`),
// never print the raw lookup ("undefined pts").
export function weekPoints(events, week) {
  const totals = new Map()
  for (const e of events) {
    if (e.week_number !== week) continue
    totals.set(e.student_id, (totals.get(e.student_id) ?? 0) + e.points)
  }
  return totals
}

// events: ONE student's events (caller filters). activityTypes:
// [{ id, category }] in display order. Returns [{ id, category, points }]
// zero-filled in the same order. Display aggregation: a net-negative
// activity (a void exceeding its original — shouldn't happen, but ledgers
// surprise) clamps to 0 so no bar renders negative. Season totals stay
// unclamped in seasonRanks.
export function activityBreakdown(events, activityTypes) {
  const sums = new Map(activityTypes.map(a => [a.id, 0]))
  for (const e of events) {
    if (!sums.has(e.activity_type_id)) continue
    sums.set(e.activity_type_id, sums.get(e.activity_type_id) + e.points)
  }
  return activityTypes.map(a => ({
    id: a.id,
    category: a.category,
    points: Math.max(0, sums.get(a.id)),
  }))
}

// previous − current: positive = climbed, negative = fell, 0 = held.
// null when either rank is missing (week 1 / no snapshot / zero events) —
// render a neutral badge, never a fake ▲0.
export function rankTrend(current, previous) {
  if (current == null || previous == null) return null
  return previous - current
}

// The cycle containing the given week (inclusive boundaries), or null.
export function cycleForWeek(cycles, week) {
  return cycles.find(c => week >= c.week_start && week <= c.week_end) ?? null
}

// "Top N + your position": ranks from seasonRanks, studentId = the viewer.
// Returns { top, you, youInTop }. you is null when the viewer is unranked
// (zero events); when youInTop is false, render `you` below a separator.
export function leaderboardSlice(ranks, studentId, topN = 10) {
  const top = ranks.slice(0, topN)
  const you = ranks.find(r => r.student_id === studentId) ?? null
  const youInTop = you !== null && top.includes(you)
  return { top, you, youInTop }
}
