const test = require('node:test')
const assert = require('node:assert/strict')

const engine = import('../src/engine/curve.js')

/*
Hand-calculated expected values — mirrors SQL curve_points exactly.

WuClap default curve: top=10, step=1, cutoff=8, floor=1
| rank | expected | why                          |
|------|----------|------------------------------|
| 1    | 10       | top                          |
| 2    | 9        | 10 - 1*1                     |
| 8    | 3        | 10 - 7*1  (rank = cutoff)    |
| 9    | 1        | floor     (rank = cutoff+1)  |
| null | 1        | participated, unranked       |

Boundary curve: top=8, step=1, cutoff=8, floor=1
| rank 8 | 1 | 8 - 7*1 = 1 = floor exactly (invariant holds with equality) |

Invalid curve: top=5, step=1, cutoff=8, floor=1
| lowest curve point = 5 - 7*1 = -2 < floor 1 → validateCurve rejects |

Flat curve (step=0): top=5, step=0, cutoff=3, floor=2
| ranks 1,2,3 | 5 | top - (rank-1)*0 |
| rank 4      | 2 | floor            |
*/

const wuclap = { top_points: 10, step: 1, ranked_cutoff: 8, participation_floor: 1 }

test('WuClap default curve: ranked positions', async () => {
  const { curvePoints } = await engine
  assert.equal(curvePoints(1, wuclap), 10)
  assert.equal(curvePoints(2, wuclap), 9)
  assert.equal(curvePoints(8, wuclap), 3) // rank = cutoff
  assert.equal(curvePoints(9, wuclap), 1) // rank = cutoff + 1 → floor
})

test('null rank → participation floor', async () => {
  const { curvePoints } = await engine
  assert.equal(curvePoints(null, wuclap), 1)
})

test('floor-equals-lowest-curve-point boundary curve is valid and pays floor at cutoff', async () => {
  const { curvePoints, validateCurve } = await engine
  const boundary = { top_points: 8, step: 1, ranked_cutoff: 8, participation_floor: 1 }
  assert.equal(validateCurve(boundary).ok, true)
  assert.equal(curvePoints(8, boundary), 1) // 8 - 7*1 = 1 = floor exactly
})

test('invariant violation rejected on save', async () => {
  const { validateCurve } = await engine
  const bad = { top_points: 5, step: 1, ranked_cutoff: 8, participation_floor: 1 }
  const result = validateCurve(bad)
  assert.equal(result.ok, false)
  assert.ok(result.error)
})

test('flat curve (step = 0)', async () => {
  const { curvePoints, validateCurve } = await engine
  const flat = { top_points: 5, step: 0, ranked_cutoff: 3, participation_floor: 2 }
  assert.equal(validateCurve(flat).ok, true)
  assert.equal(curvePoints(1, flat), 5)
  assert.equal(curvePoints(2, flat), 5)
  assert.equal(curvePoints(3, flat), 5)
  assert.equal(curvePoints(4, flat), 2)
})
