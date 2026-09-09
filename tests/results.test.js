const test = require('node:test')
const assert = require('node:assert/strict')

const engine = import('../src/engine/results.js')

/*
Hand-calculated expected ranks — using the real scores from
docs/samples/wuclap_results_sample.csv ("Points ??" column), sorted
descending:

| name      | score | rank | why                                    |
|-----------|-------|------|-----------------------------------------|
| Yustina   | 2000  | 1    | highest                                 |
| Aimee     | 1000  | 2    |                                          |
| Jason     | 975   | 3    | tied with Samrit                        |
| Samrit    | 975   | 3    | tied with Jason — next rank skips to 5  |
| Socrates  | 950   | 5    | rank = position (5th), not 4            |
| Mitchell  | 0     | 6    | lowest, still ranked (participated)     |

Synthetic case: a null score (participated, unranked — e.g. a row that
never resolved to a numeric score) is excluded from the ranking pass
entirely and gets rank: null, same as curvePoints' floor-only behaviour.
*/

const wuclapFixtureScores = [
  { id: 'yustina', score: 2000 },
  { id: 'aimee', score: 1000 },
  { id: 'jason', score: 975 },
  { id: 'samrit', score: 975 },
  { id: 'socrates', score: 950 },
  { id: 'mitchell', score: 0 },
]

test('real WuClap fixture scores: standard competition ranking incl. a tie', async () => {
  const { rankResultRows } = await engine
  const ranked = rankResultRows(wuclapFixtureScores)
  const byId = Object.fromEntries(ranked.map((r) => [r.id, r.rank]))
  assert.deepEqual(byId, {
    yustina: 1,
    aimee: 2,
    jason: 3,
    samrit: 3,
    socrates: 5,
    mitchell: 6,
  })
})

test('null-score row is excluded from ranking, passes through with rank: null', async () => {
  const { rankResultRows } = await engine
  const rows = [...wuclapFixtureScores, { id: 'unresolved', score: null }]
  const ranked = rankResultRows(rows)
  const unresolved = ranked.find((r) => r.id === 'unresolved')
  assert.equal(unresolved.rank, null)
  // scored rows unaffected by the extra null row
  assert.equal(ranked.find((r) => r.id === 'yustina').rank, 1)
  assert.equal(ranked.length, wuclapFixtureScores.length + 1)
})

test('empty input', async () => {
  const { rankResultRows } = await engine
  assert.deepEqual(rankResultRows([]), [])
})

test('all-null-score input: nothing ranked, all pass through', async () => {
  const { rankResultRows } = await engine
  const rows = [{ id: 'a', score: null }, { id: 'b', score: null }]
  const ranked = rankResultRows(rows)
  assert.ok(ranked.every((r) => r.rank === null))
  assert.equal(ranked.length, 2)
})
