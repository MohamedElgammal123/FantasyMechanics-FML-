const test = require('node:test')
const assert = require('node:assert/strict')

const engine = import('../src/engine/weeks.js')

/*
Mirror of SQL week_number_for:
  week = clamp( floor(epochSeconds(at - week1_start::timestamptz) / 604800) + 1,
                1, weeks_total )
week1_start is a DATE interpreted at midnight UTC (Supabase runs the DB in UTC).
The JS mirror must use pure epoch-seconds division — no calendar/local-time math.

week1_start = 2027-01-04 (a Monday), weeks_total = 13:
| at (UTC)                    | elapsed      | raw week | clamped |
|-----------------------------|--------------|----------|---------|
| 2027-01-04T00:00:00Z        | 0            | 1        | 1       |
| 2027-01-10T23:00:00Z        | 6d 23h       | 1        | 1       |
| 2027-01-11T00:00:00Z        | 7d exactly   | 2        | 2       |
| 2027-01-01T00:00:00Z        | −3d          | 0        | 1       |
| 2027-04-14T00:00:00Z        | 100d         | 15       | 13      |

DST pin — week1_start = 2027-03-08 (Mon), North-American DST springs forward
on 2027-03-14. at = 2027-03-15T00:30:00Z:
  elapsed = 7d 0.5h = 606,600 s; 606600 / 604800 = 1.0029… → floor 1 → week 2.
Local-wall-clock math would see only 167.5 h (< 7 days, the skipped DST hour)
and wrongly answer week 1. Locks the JS mirror to epoch-seconds semantics.
*/

test('week 1 starts at week1_start and runs 7 full days', async () => {
  const { weekNumberFor } = await engine
  assert.equal(weekNumberFor('2027-01-04', 13, '2027-01-04T00:00:00Z'), 1)
  assert.equal(weekNumberFor('2027-01-04', 13, '2027-01-10T23:00:00Z'), 1)
})

test('exactly 7 days after week1_start → week 2', async () => {
  const { weekNumberFor } = await engine
  assert.equal(weekNumberFor('2027-01-04', 13, '2027-01-11T00:00:00Z'), 2)
})

test('before week1_start clamps to 1', async () => {
  const { weekNumberFor } = await engine
  assert.equal(weekNumberFor('2027-01-04', 13, '2027-01-01T00:00:00Z'), 1)
})

test('past the end of term clamps to weeks_total', async () => {
  const { weekNumberFor } = await engine
  // +100 days → raw week 15 → clamped to 13
  assert.equal(weekNumberFor('2027-01-04', 13, '2027-04-14T00:00:00Z'), 13)
})

test('DST pin: epoch-seconds division, immune to the spring-forward hour', async () => {
  const { weekNumberFor } = await engine
  // 2027-03-14 DST transition sits inside the first week
  assert.equal(weekNumberFor('2027-03-08', 13, '2027-03-15T00:30:00Z'), 2)
})

/*
weekEndDate (P4): exclusive end of week N = week1_start + N*604800 s — the same
epoch instant weekNumberFor flips to N+1. Powers the cycle-end countdown
(cycle ends at weekEndDate(week1_start, cycle.week_end)).

week1_start = 2027-01-04:
| week | end instant (UTC)     | hand check           |
|------|-----------------------|----------------------|
| 1    | 2027-01-11T00:00:00Z  | Jan 4 + 7 d          |
| 4    | 2027-02-01T00:00:00Z  | Jan 4 + 28 d         |
| 10   | 2027-03-15T00:00:00Z  | Jan 4 + 70 d — spans the 2027-03-14 DST
|      |                       | spring-forward; epoch math, not calendar |
*/
test('weekEndDate: week1_start + N weeks of epoch seconds', async () => {
  const { weekEndDate } = await engine
  assert.equal(weekEndDate('2027-01-04', 1).toISOString(), '2027-01-11T00:00:00.000Z')
  assert.equal(weekEndDate('2027-01-04', 4).toISOString(), '2027-02-01T00:00:00.000Z')
})

test('weekEndDate: DST pin — end of week 10 is exactly 70 days of epoch time', async () => {
  const { weekEndDate } = await engine
  assert.equal(weekEndDate('2027-01-04', 10).toISOString(), '2027-03-15T00:00:00.000Z')
})

test('weekEndDate coheres with weekNumberFor: the boundary belongs to the next week', async () => {
  const { weekEndDate, weekNumberFor } = await engine
  const end1 = weekEndDate('2027-01-04', 1)
  assert.equal(weekNumberFor('2027-01-04', 13, end1), 2)
  assert.equal(weekNumberFor('2027-01-04', 13, new Date(end1.getTime() - 1000)), 1)
})
