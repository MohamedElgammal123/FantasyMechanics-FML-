const test = require('node:test')
const assert = require('node:assert/strict')

const lib = import('../src/lib/format.js')

/*
fmtCountdown(msRemaining) — < 24h ticking HH:MM:SS, >= 24h "Nd Mh". Negative
input clamps to 0. This is engine-shaped date math (no React/Supabase) that
P7 makes load-bearing on every game card countdown, so it's pinned here even
though it already shipped with OpenGameCard (P4).

| msRemaining                          | breakdown           | output      |
|----------------------------------------|----------------------|-------------|
| -5000 (negative)                       | clamped to 0         | "00:00:00"  |
| 0                                       | 0h 0m 0s             | "00:00:00"  |
| 59,999 (59.999s)                        | 0h 0m 59s            | "00:00:59"  |
| 3,661,000 (1h 1m 1s)                    | 1h 1m 1s             | "01:01:01"  |
| 86,399,000 (23h 59m 59s)                | 23h 59m 59s          | "23:59:59"  |
| 86,400,000 (exactly 24h)                | 1d 0h                | "1d 0h"     |
| 90,000,000 (1d 1h)                      | 1d 1h                | "1d 1h"     |
| 266,400,000 (3d 2h)                     | 3d 2h                | "3d 2h"     |
*/

test('negative remaining clamps to zero', async () => {
  const { fmtCountdown } = await lib
  assert.equal(fmtCountdown(-5000), '00:00:00')
})

test('zero remaining', async () => {
  const { fmtCountdown } = await lib
  assert.equal(fmtCountdown(0), '00:00:00')
})

test('under a minute, seconds only', async () => {
  const { fmtCountdown } = await lib
  assert.equal(fmtCountdown(59999), '00:00:59')
})

test('hours, minutes, seconds all nonzero', async () => {
  const { fmtCountdown } = await lib
  assert.equal(fmtCountdown(3661000), '01:01:01')
})

test('1ms before the 24h threshold stays HH:MM:SS', async () => {
  const { fmtCountdown } = await lib
  assert.equal(fmtCountdown(86399000), '23:59:59')
})

test('exactly 24h flips to day format', async () => {
  const { fmtCountdown } = await lib
  assert.equal(fmtCountdown(86400000), '1d 0h')
})

test('one day one hour', async () => {
  const { fmtCountdown } = await lib
  assert.equal(fmtCountdown(90000000), '1d 1h')
})

test('multi-day', async () => {
  const { fmtCountdown } = await lib
  assert.equal(fmtCountdown(266400000), '3d 2h')
})
