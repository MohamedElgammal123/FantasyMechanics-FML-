const test = require('node:test')
const assert = require('node:assert/strict')

const engine = import('../src/engine/standings.js')

/*
Cycle 2 = weeks 3–4. Events (student, week, points):

| student | events                       | in-cycle total          |
|---------|------------------------------|-------------------------|
| A       | wk3 +5, wk4 +7               | 12                      |
| B       | wk2 +20 (excluded), wk3 +12  | 12                      |
| C       | wk4 +9, wk5 +6 (excluded)    | 9                       |

→ A and B tie at 12 → co-champions {A, B}; C is rank 3 (1, 1, 3).
Both cycle boundary weeks count (wk3 and wk4 in; wk2 and wk5 out).
*/

const cycle = { week_start: 3, week_end: 4 }
const events = [
  { student_id: 'A', week_number: 3, points: 5 },
  { student_id: 'A', week_number: 4, points: 7 },
  { student_id: 'B', week_number: 2, points: 20 }, // before cycle — excluded
  { student_id: 'B', week_number: 3, points: 12 },
  { student_id: 'C', week_number: 4, points: 9 },
  { student_id: 'C', week_number: 5, points: 6 },  // after cycle — excluded
]

test('cycle standings sum only events inside [week_start, week_end]', async () => {
  const { cycleStandings } = await engine
  const standings = cycleStandings(events, cycle)
  const byId = Object.fromEntries(standings.map(s => [s.student_id, s]))
  assert.equal(byId.A.points, 12)
  assert.equal(byId.B.points, 12) // wk2 +20 excluded
  assert.equal(byId.C.points, 9)  // wk5 +6 excluded
})

test('tie at the top → competition ranks 1, 1, 3', async () => {
  const { cycleStandings } = await engine
  const standings = cycleStandings(events, cycle)
  const byId = Object.fromEntries(standings.map(s => [s.student_id, s]))
  assert.equal(byId.A.rank, 1)
  assert.equal(byId.B.rank, 1)
  assert.equal(byId.C.rank, 3)
})

test('co-champions: every rank-1 student is a champion', async () => {
  const { cycleStandings, cycleChampions } = await engine
  const champions = cycleChampions(cycleStandings(events, cycle))
  assert.deepEqual(champions.map(c => c.student_id).sort(), ['A', 'B'])
  assert.ok(champions.every(c => c.points === 12))
})

test('single leader → single champion', async () => {
  const { cycleStandings, cycleChampions } = await engine
  const solo = cycleChampions(cycleStandings(
    [
      { student_id: 'A', week_number: 3, points: 10 },
      { student_id: 'B', week_number: 3, points: 7 },
    ],
    cycle
  ))
  assert.deepEqual(solo.map(c => c.student_id), ['A'])
})
