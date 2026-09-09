const test = require('node:test')
const assert = require('node:assert/strict')

const engine = import('../src/engine/ranking.js')

/*
Standard competition ranking (1, 2, 2, 4) — resolved decision #1.
Input: [{ id, score }] in any order. Output: same rows sorted by score
descending with a rank added; ties share a rank, the next rank skips.

| scores           | ranks        |
|------------------|--------------|
| 50, 40, 40, 30   | 1, 2, 2, 4   |
| 50, 50, 50, 20   | 1, 1, 1, 4   |
*/

test('two-way tie: 1, 2, 2, 4', async () => {
  const { competitionRanks } = await engine
  const ranked = competitionRanks([
    { id: 'A', score: 50 },
    { id: 'B', score: 40 },
    { id: 'C', score: 40 },
    { id: 'D', score: 30 },
  ])
  assert.deepEqual(ranked.map(r => [r.id, r.rank]), [['A', 1], ['B', 2], ['C', 2], ['D', 4]])
})

test('three-way tie at the top: 1, 1, 1, 4', async () => {
  const { competitionRanks } = await engine
  const ranked = competitionRanks([
    { id: 'A', score: 50 },
    { id: 'B', score: 50 },
    { id: 'C', score: 50 },
    { id: 'D', score: 20 },
  ])
  assert.deepEqual(ranked.map(r => r.rank), [1, 1, 1, 4])
})

test('unsorted input is sorted by score descending before ranking', async () => {
  const { competitionRanks } = await engine
  const ranked = competitionRanks([
    { id: 'D', score: 30 },
    { id: 'B', score: 40 },
    { id: 'A', score: 50 },
    { id: 'C', score: 40 },
  ])
  assert.deepEqual(ranked.map(r => r.id), ['A', 'B', 'C', 'D'])
  assert.deepEqual(ranked.map(r => r.rank), [1, 2, 2, 4])
})
