const test = require('node:test')
const assert = require('node:assert/strict')

const engine = import('../src/engine/teams.js')

/*
Team = {X, Y}, team_unlock_week = 7. One student's events split across the
unlock week, checked under both scoring modes:

| student | events                                 | full_season | from_unlock (wk ≥ 7) |
|---------|----------------------------------------|-------------|----------------------|
| X       | wk5 +10, wk6 +8, wk7 +6, wk9 +4        | 28          | 10  (wk7 inclusive)  |
| Y       | wk6 +5, wk8 +3                         | 8           | 3                    |
| team    |                                        | 36          | 13                   |

wk7 +6 is the boundary event: counted under from_unlock (>=, not >).
Events from non-members (Z) never count toward the team.
*/

const events = [
  { student_id: 'X', week_number: 5, points: 10 },
  { student_id: 'X', week_number: 6, points: 8 },
  { student_id: 'X', week_number: 7, points: 6 }, // boundary: week = unlock week
  { student_id: 'X', week_number: 9, points: 4 },
  { student_id: 'Y', week_number: 6, points: 5 },
  { student_id: 'Y', week_number: 8, points: 3 },
  { student_id: 'Z', week_number: 8, points: 50 }, // not on the team
]

test('from_unlock: only events with week_number >= unlock week, boundary inclusive', async () => {
  const { teamTotals } = await engine
  assert.equal(teamTotals(events, ['X', 'Y'], 'from_unlock', 7), 13) // X: 6+4, Y: 3
})

test('full_season: all member events', async () => {
  const { teamTotals } = await engine
  assert.equal(teamTotals(events, ['X', 'Y'], 'full_season', 7), 36) // X: 28, Y: 8
})

test('non-member events are excluded in both modes', async () => {
  const { teamTotals } = await engine
  assert.equal(teamTotals(events, ['Z'], 'full_season', 7), 50)
  assert.equal(teamTotals(events, ['X', 'Y'], 'full_season', 7), 36) // Z's 50 not included
})

test('team standings rank teams with competition ranking', async () => {
  const { teamStandings } = await engine
  const teams = [
    { id: 't1', member_ids: ['X', 'Y'] }, // from_unlock: 13
    { id: 't2', member_ids: ['Z'] },      // from_unlock: 50
  ]
  const standings = teamStandings(events, teams, 'from_unlock', 7)
  assert.deepEqual(standings.map(s => [s.team_id, s.points, s.rank]),
    [['t2', 50, 1], ['t1', 13, 2]])
})
