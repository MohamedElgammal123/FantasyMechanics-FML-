const test = require('node:test')
const assert = require('node:assert/strict')

const engine = import('../src/engine/auth.js')

/*
isAllowedEmail — client mirror of 0013's SQL predicate
(`lower(email) like '%@ualberta.ca'`). Hand-set table covers the two
lookalike families the suffix match must reject:
- subdomain: 'x@gmx.ualberta.ca' ends in 'ualberta.ca' but NOT in
  '@ualberta.ca' (the '@' anchors the whole domain) — this is a real
  shape: UAlberta's own mail infra rewrites Delivered-To through
  gmx.ualberta.ca.
- suffix: 'x@notualberta.ca' — last 12 chars are 'tualberta.ca',
  not '@ualberta.ca'.
*/
test('isAllowedEmail: accepts exactly @ualberta.ca, any case, plus-aliases', async () => {
  const { isAllowedEmail } = await engine
  assert.equal(isAllowedEmail('student@ualberta.ca'), true)
  assert.equal(isAllowedEmail('Student@UAlberta.CA'), true)
  assert.equal(isAllowedEmail('mowafysa+seed@ualberta.ca'), true)
})

test('isAllowedEmail: rejects other domains and both lookalike families', async () => {
  const { isAllowedEmail } = await engine
  assert.equal(isAllowedEmail('intruder@gmail.com'), false)
  assert.equal(isAllowedEmail('x@gmx.ualberta.ca'), false) // subdomain lookalike
  assert.equal(isAllowedEmail('x@notualberta.ca'), false) // suffix lookalike
  assert.equal(isAllowedEmail('ualberta.ca'), false) // no local part / no @
})

test('isAllowedEmail: non-strings are rejected, never throw', async () => {
  const { isAllowedEmail } = await engine
  assert.equal(isAllowedEmail(null), false)
  assert.equal(isAllowedEmail(undefined), false)
  assert.equal(isAllowedEmail(42), false)
})
