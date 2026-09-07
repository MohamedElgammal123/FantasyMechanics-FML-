const test = require('node:test')
const assert = require('node:assert/strict')

const engine = import('../src/engine/games.js')

/*
gameStatus(game, now, hasPostedResults) — no stored status column; derived
from opens_at/closes_at + whether a POSTED result set exists.

game = { opens_at: '2027-02-01T00:00:00Z', closes_at: '2027-02-08T00:00:00Z' }

| now (UTC)              | hasPostedResults | status          | why                                  |
|-------------------------|-------------------|-----------------|---------------------------------------|
| 2027-01-31T23:59:59.999Z| n/a               | upcoming        | 1ms before opens_at                   |
| 2027-02-01T00:00:00Z    | n/a               | open            | exactly opens_at — boundary is open   |
| 2027-02-07T23:59:59.999Z| n/a               | open            | 1ms before closes_at                  |
| 2027-02-08T00:00:00Z    | false             | closed_awaiting | exactly closes_at, no posted results  |
| 2027-02-08T00:00:00Z    | true              | closed_scored   | exactly closes_at, results posted     |
| 2027-03-01T00:00:00Z    | false             | closed_awaiting | well past close, still unscored       |
| 2027-03-01T00:00:00Z    | true              | closed_scored   | well past close, scored               |

The opens_at/closes_at boundary convention mirrors weekEndDate/weekNumberFor
(weeks.js): the exact instant belongs to the state that starts there, not
the one that ends there.
*/

const game = { opens_at: '2027-02-01T00:00:00Z', closes_at: '2027-02-08T00:00:00Z' }

test('1ms before opens_at is upcoming', async () => {
  const { gameStatus } = await engine
  assert.equal(gameStatus(game, '2027-01-31T23:59:59.999Z', false), 'upcoming')
})

test('exactly opens_at is open (boundary belongs to open)', async () => {
  const { gameStatus } = await engine
  assert.equal(gameStatus(game, '2027-02-01T00:00:00Z', false), 'open')
})

test('1ms before closes_at is still open', async () => {
  const { gameStatus } = await engine
  assert.equal(gameStatus(game, '2027-02-07T23:59:59.999Z', false), 'open')
})

test('exactly closes_at with no posted results is closed_awaiting', async () => {
  const { gameStatus } = await engine
  assert.equal(gameStatus(game, '2027-02-08T00:00:00Z', false), 'closed_awaiting')
})

test('exactly closes_at with posted results is closed_scored', async () => {
  const { gameStatus } = await engine
  assert.equal(gameStatus(game, '2027-02-08T00:00:00Z', true), 'closed_scored')
})

test('well past closes_at, unscored stays closed_awaiting', async () => {
  const { gameStatus } = await engine
  assert.equal(gameStatus(game, '2027-03-01T00:00:00Z', false), 'closed_awaiting')
})

test('well past closes_at, scored is closed_scored', async () => {
  const { gameStatus } = await engine
  assert.equal(gameStatus(game, '2027-03-01T00:00:00Z', true), 'closed_scored')
})

test('accepts a Date object for now, not just an ISO string', async () => {
  const { gameStatus } = await engine
  assert.equal(gameStatus(game, new Date('2027-02-01T00:00:00Z'), false), 'open')
})
