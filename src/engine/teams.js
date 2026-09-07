// Team aggregation, both scoring modes (data model §8).

import { competitionRanks } from './ranking.js'

// from_unlock: sum member events where week_number >= unlockWeek (inclusive).
// full_season: sum all member events.
export function teamTotals(events, memberIds, mode, unlockWeek) {
  const members = new Set(memberIds)
  return events.reduce((sum, e) => {
    if (!members.has(e.student_id)) return sum
    if (mode === 'from_unlock' && e.week_number < unlockWeek) return sum
    return sum + e.points
  }, 0)
}

// teams: [{ id, member_ids }]. Returns [{ team_id, points, rank }] sorted
// by points descending, competition ranking on ties.
export function teamStandings(events, teams, mode, unlockWeek) {
  const rows = teams.map(t => ({
    id: t.id,
    score: teamTotals(events, t.member_ids, mode, unlockWeek),
  }))
  return competitionRanks(rows).map(r => ({
    team_id: r.id,
    points: r.score,
    rank: r.rank,
  }))
}
