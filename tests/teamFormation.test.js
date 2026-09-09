const test = require('node:test')
const assert = require('node:assert/strict')

const engine = import('../src/engine/teamFormation.js')

test('seatsLeft: team_size 3, counts both members and pending invites against the cap', async () => {
  const { seatsLeft } = await engine
  assert.equal(seatsLeft(1, 0, 3), 2) // just the captain
  assert.equal(seatsLeft(1, 1, 3), 1) // captain + 1 pending invite
  assert.equal(seatsLeft(2, 1, 3), 0) // 2 members + 1 pending = fully spoken for
  assert.equal(seatsLeft(3, 0, 3), 0) // full team, no negative seats
  assert.equal(seatsLeft(2, 2, 3), 0) // over-invited (shouldn't happen via the UI, but never negative)
})

/*
classifyClassmate — viewer V, own team members {V, M1}, one pending
invite out to P1, and a classmate U2 on someone else's (fully separate)
team in the section:
*/
test('classifyClassmate: you / teammate / invited / unavailable / invite', async () => {
  const { classifyClassmate } = await engine
  const ctx = {
    viewerId: 'V',
    myTeamMemberIds: ['V', 'M1'],
    teamedStudentIds: ['V', 'M1', 'U2'], // every student on any team in the section
    myPendingInviteeIds: ['P1'],
  }
  assert.equal(classifyClassmate('V', ctx), 'you')
  assert.equal(classifyClassmate('M1', ctx), 'teammate')
  assert.equal(classifyClassmate('P1', ctx), 'invited')
  assert.equal(classifyClassmate('U2', ctx), 'unavailable')
  assert.equal(classifyClassmate('U3', ctx), 'invite') // untamed, uninvited
})

/*
wasAutoFilled — formation deadline Fri 17:00. A member who accepted an
invite Thursday joined before the deadline (self-formed); a member
inserted by expire_team_formation's fill/new-team step is stamped at
`now()` at-or-after the deadline instant (>= inclusive, matching
formationExpiryDue in src/engine/schedule.js).
*/
test('wasAutoFilled: joined_at before the deadline is self-formed, at-or-after is auto-fill', async () => {
  const { wasAutoFilled } = await engine
  const deadline = '2026-03-20T17:00:00Z'
  assert.equal(wasAutoFilled('2026-03-19T12:00:00Z', deadline), false) // Thursday, before
  assert.equal(wasAutoFilled('2026-03-20T17:00:00Z', deadline), true) // exact instant — inclusive
  assert.equal(wasAutoFilled('2026-03-20T17:00:01Z', deadline), true) // after
  assert.equal(wasAutoFilled('2026-03-19T12:00:00Z', null), false) // no deadline set → never auto-filled
})

/*
prizeProgress — Bronze 900 / Silver 1400 / Gold 2000 (design brief's own
numbers). Team at 1,204 pts: Bronze reached, Silver next, progress is the
fraction of the way from Bronze to Silver (1204-900)/(1400-900) = 304/500
= 0.608.
*/
test('prizeProgress: reached tiers flagged, progress measured from the last reached tier', async () => {
  const { prizeProgress } = await engine
  const tiers = [
    { name: 'Gold', threshold_points: 2000 },
    { name: 'Bronze', threshold_points: 900 },
    { name: 'Silver', threshold_points: 1400 },
  ]
  const result = prizeProgress(1204, tiers)
  assert.deepEqual(result.tiers.map(t => [t.name, t.reached]), [
    ['Bronze', true], ['Silver', false], ['Gold', false],
  ])
  assert.equal(result.next.name, 'Silver')
  assert.equal(result.pct, 0.608)
})

test('prizeProgress: zero points before the first tier — 0 reached, progress measured from 0', async () => {
  const { prizeProgress } = await engine
  const tiers = [{ name: 'Bronze', threshold_points: 900 }, { name: 'Silver', threshold_points: 1400 }]
  const result = prizeProgress(300, tiers)
  assert.deepEqual(result.tiers.map(t => t.reached), [false, false])
  assert.equal(result.next.name, 'Bronze')
  assert.equal(result.pct, 300 / 900)
})

test('prizeProgress: all tiers reached — no next tier, progress reads full', async () => {
  const { prizeProgress } = await engine
  const tiers = [{ name: 'Bronze', threshold_points: 900 }, { name: 'Silver', threshold_points: 1400 }]
  const result = prizeProgress(1500, tiers)
  assert.deepEqual(result.tiers.map(t => t.reached), [true, true])
  assert.equal(result.next, null)
  assert.equal(result.pct, 1)
})

test('prizeProgress: no tiers configured — empty, honest no-op rather than a fake bar', async () => {
  const { prizeProgress } = await engine
  const result = prizeProgress(500, [])
  assert.deepEqual(result.tiers, [])
  assert.equal(result.next, null)
  assert.equal(result.pct, 1)
})
