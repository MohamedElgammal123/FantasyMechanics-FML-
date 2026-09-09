// Cycle standings and champions (data model §7).

import { competitionRanks } from './ranking.js'

// events: [{ student_id, week_number, points }]; cycle: { week_start, week_end }.
// Returns [{ student_id, points, rank }] sorted by points descending.
export function cycleStandings(events, cycle) {
  const totals = new Map()
  for (const e of events) {
    if (e.week_number < cycle.week_start || e.week_number > cycle.week_end) continue
    totals.set(e.student_id, (totals.get(e.student_id) ?? 0) + e.points)
  }
  const rows = [...totals].map(([id, score]) => ({ id, score }))
  return competitionRanks(rows).map(r => ({
    student_id: r.id,
    points: r.score,
    rank: r.rank,
  }))
}

// Ties produce co-champions: every rank-1 row is a champion.
export function cycleChampions(standings) {
  return standings
    .filter(s => s.rank === 1)
    .map(s => ({ student_id: s.student_id, points: s.points }))
}
