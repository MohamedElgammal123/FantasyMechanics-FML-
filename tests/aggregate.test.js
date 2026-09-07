const test = require('node:test')
const assert = require('node:assert/strict')

const engine = import('../src/engine/aggregate.js')

/*
P4 dashboard/leaderboard aggregation helpers. All pure; screens never sum.

Shared fixture — point_events (student, week, activity, points).
B's week-1 game rows model a posted-then-voided result set (+10 then −10):

| student | events                                              | season total |
|---------|-----------------------------------------------------|--------------|
| A       | wk1 wuclap +10, wk2 wuclap +8, wk2 discussion +3,   | 26           |
|         | wk3 game +5                                         |              |
| B       | wk1 wuclap +9, wk1 game +10, wk1 game −10 (void),   | 18           |
|         | wk3 wuclap +9                                       |              |
| C       | wk2 wuclap +1                                       | 1            |

seasonRanks → A 26 (r1), B 18 (r2), C 1 (r3).

weekPoints, week 2 → A: 8+3 = 11, C: 1; B has no wk2 events → absent from map.
weekPoints, week 1 → A: 10, B: 9+10−10 = 9 (void nets out).

activityBreakdown over A's events (canonical 6 activity types):
| activity         | category    | points |
|------------------|-------------|--------|
| discussion       | individual  | 3      |
| correct_mistakes | individual  | 0      |
| act_as_professor | individual  | 0      |
| demo             | individual  | 0      |
| wuclap           | large_scale | 18     |
| game             | large_scale | 5      |
Zero-filled, input order preserved. Over B's events: game = 0 (void nets out).

rankTrend(current, previous) = previous − current (positive = climbed):
| current | previous | trend |
|---------|----------|-------|
| 12      | 15       | +3    |
| 5       | 3        | −2    |
| 4       | 4        | 0     |
| 7       | null     | null  |  ← week 1 / no snapshot: no fake arrow
| null    | 7        | null  |  ← no current rank (zero events)
*/

const events = [
  { student_id: 'A', week_number: 1, activity_type_id: 'wuclap',     points: 10 },
  { student_id: 'A', week_number: 2, activity_type_id: 'wuclap',     points: 8 },
  { student_id: 'A', week_number: 2, activity_type_id: 'discussion', points: 3 },
  { student_id: 'A', week_number: 3, activity_type_id: 'game',       points: 5 },
  { student_id: 'B', week_number: 1, activity_type_id: 'wuclap',     points: 9 },
  { student_id: 'B', week_number: 1, activity_type_id: 'game',       points: 10 },
  { student_id: 'B', week_number: 1, activity_type_id: 'game',       points: -10 }, // void
  { student_id: 'B', week_number: 3, activity_type_id: 'wuclap',     points: 9 },
  { student_id: 'C', week_number: 2, activity_type_id: 'wuclap',     points: 1 },
]

const activityTypes = [
  { id: 'discussion',       category: 'individual' },
  { id: 'correct_mistakes', category: 'individual' },
  { id: 'act_as_professor', category: 'individual' },
  { id: 'demo',             category: 'individual' },
  { id: 'wuclap',           category: 'large_scale' },
  { id: 'game',             category: 'large_scale' },
]

test('seasonRanks: full-season totals with competition ranks, voids netted', async () => {
  const { seasonRanks } = await engine
  const ranks = seasonRanks(events)
  assert.deepEqual(ranks, [
    { student_id: 'A', points: 26, rank: 1 },
    { student_id: 'B', points: 18, rank: 2 }, // +10 −10 game void nets to 0
    { student_id: 'C', points: 1,  rank: 3 },
  ])
})

test('seasonRanks: season-total tie shares a rank, next rank skips', async () => {
  const { seasonRanks } = await engine
  const ranks = seasonRanks([
    ...events,
    { student_id: 'D', week_number: 1, activity_type_id: 'wuclap', points: 18 },
  ])
  const byId = Object.fromEntries(ranks.map(r => [r.student_id, r.rank]))
  assert.equal(byId.A, 1)
  assert.equal(byId.B, 2) // ties with D at 18
  assert.equal(byId.D, 2)
  assert.equal(byId.C, 4) // 1, 2, 2, 4
})

test('weekPoints: sums only the given week; students without events absent', async () => {
  const { weekPoints } = await engine
  const wk2 = weekPoints(events, 2)
  assert.equal(wk2.get('A'), 11) // 8 + 3
  assert.equal(wk2.get('C'), 1)
  assert.equal(wk2.has('B'), false) // no wk2 events → absent, not 0
})

test('weekPoints: void inside the week nets out', async () => {
  const { weekPoints } = await engine
  const wk1 = weekPoints(events, 1)
  assert.equal(wk1.get('A'), 10)
  assert.equal(wk1.get('B'), 9) // 9 + 10 − 10
})

test('activityBreakdown: zero-filled, input order preserved, category attached', async () => {
  const { activityBreakdown } = await engine
  const own = events.filter(e => e.student_id === 'A')
  assert.deepEqual(activityBreakdown(own, activityTypes), [
    { id: 'discussion',       category: 'individual',  points: 3 },
    { id: 'correct_mistakes', category: 'individual',  points: 0 },
    { id: 'act_as_professor', category: 'individual',  points: 0 },
    { id: 'demo',             category: 'individual',  points: 0 },
    { id: 'wuclap',           category: 'large_scale', points: 18 },
    { id: 'game',             category: 'large_scale', points: 5 },
  ])
})

test('activityBreakdown: voided activity nets to zero, not negative', async () => {
  const { activityBreakdown } = await engine
  const own = events.filter(e => e.student_id === 'B')
  const game = activityBreakdown(own, activityTypes).find(a => a.id === 'game')
  assert.equal(game.points, 0)
})

test('activityBreakdown: a net-negative activity clamps to 0 for display', async () => {
  const { activityBreakdown } = await engine
  // Shouldn't occur (voids mirror originals), but ledgers surprise: a void
  // exceeding its original within one activity must not render a negative bar.
  const surprise = [
    { student_id: 'B', week_number: 1, activity_type_id: 'game', points: 10 },
    { student_id: 'B', week_number: 2, activity_type_id: 'game', points: -12 },
    { student_id: 'B', week_number: 2, activity_type_id: 'wuclap', points: 4 },
  ]
  const rows = activityBreakdown(surprise, activityTypes)
  assert.equal(rows.find(a => a.id === 'game').points, 0)   // clamped, not −2
  assert.equal(rows.find(a => a.id === 'wuclap').points, 4) // others unaffected
})

test('rankTrend: previous − current; null when either side is missing', async () => {
  const { rankTrend } = await engine
  assert.equal(rankTrend(12, 15), 3)   // climbed 3 places
  assert.equal(rankTrend(5, 3), -2)    // fell 2
  assert.equal(rankTrend(4, 4), 0)     // held
  assert.equal(rankTrend(7, null), null)  // no snapshot (week 1) → no arrow
  assert.equal(rankTrend(null, 7), null)  // no current rank (zero events)
})

/*
cycleForWeek — cycles {1: wks 1–2, 2: wks 3–4, 3: wks 5–6}; boundaries inclusive:
week 3 → cycle 2, week 4 → cycle 2, week 5 → cycle 3, week 7 → null.
*/
test('cycleForWeek: inclusive boundaries; null past the last cycle', async () => {
  const { cycleForWeek } = await engine
  const cycles = [
    { number: 1, week_start: 1, week_end: 2 },
    { number: 2, week_start: 3, week_end: 4 },
    { number: 3, week_start: 5, week_end: 6 },
  ]
  assert.equal(cycleForWeek(cycles, 3).number, 2)
  assert.equal(cycleForWeek(cycles, 4).number, 2)
  assert.equal(cycleForWeek(cycles, 5).number, 3)
  assert.equal(cycleForWeek(cycles, 7), null)
})

/*
leaderboardSlice — "top 10 + your position". 12 ranked students r1..r12:
| me      | top rows | youInTop | you  |
|---------|----------|----------|------|
| rank 5  | r1..r10  | true     | r5   |
| rank 12 | r1..r10  | false    | r12  |
| absent  | r1..r10  | false    | null |  ← zero events → unranked
| (only 3 ranked, me r2) | r1..r3 | true | r2 |
*/
test('leaderboardSlice: inside top N → no extra row', async () => {
  const { leaderboardSlice, seasonRanks } = await engine
  const twelve = Array.from({ length: 12 }, (_, i) => ({
    student_id: `S${i + 1}`, week_number: 1, activity_type_id: 'wuclap', points: 100 - i,
  }))
  const ranks = seasonRanks(twelve)
  const s = leaderboardSlice(ranks, 'S5', 10)
  assert.equal(s.top.length, 10)
  assert.equal(s.youInTop, true)
  assert.equal(s.you.student_id, 'S5')
})

test('leaderboardSlice: outside top N → top 10 plus own row', async () => {
  const { leaderboardSlice, seasonRanks } = await engine
  const twelve = Array.from({ length: 12 }, (_, i) => ({
    student_id: `S${i + 1}`, week_number: 1, activity_type_id: 'wuclap', points: 100 - i,
  }))
  const s = leaderboardSlice(seasonRanks(twelve), 'S12', 10)
  assert.equal(s.top.length, 10)
  assert.equal(s.top.at(-1).student_id, 'S10')
  assert.equal(s.youInTop, false)
  assert.equal(s.you.rank, 12)
})

test('leaderboardSlice: unranked viewer (zero events) → you is null', async () => {
  const { leaderboardSlice, seasonRanks } = await engine
  const s = leaderboardSlice(seasonRanks(events), 'GHOST', 10)
  assert.equal(s.you, null)
  assert.equal(s.youInTop, false)
})

test('leaderboardSlice: fewer ranked students than N → all rows, no padding', async () => {
  const { leaderboardSlice, seasonRanks } = await engine
  const s = leaderboardSlice(seasonRanks(events), 'B', 10)
  assert.equal(s.top.length, 3)
  assert.equal(s.youInTop, true)
})
