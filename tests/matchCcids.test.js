const test = require('node:test')
const assert = require('node:assert/strict')

const ingest = import('../src/ingest/matchCcids.js')

const enrollments = [
  { ccid: 'nya1', student_id: 'student-1', fullName: 'Aimee Nya' },
  { ccid: 'jyang33', student_id: 'student-2', fullName: 'Jason Yang' },
]

test('matched row gets student_id and matchedName filled in', async () => {
  const { matchCcids } = await ingest
  const [row] = matchCcids([{ ccid: 'nya1', score: 1000 }], enrollments)
  assert.equal(row.student_id, 'student-1')
  assert.equal(row.matchedName, 'Aimee Nya')
})

test('ccid normalized (case/whitespace) before comparing both sides', async () => {
  const { matchCcids } = await ingest
  const [row] = matchCcids([{ ccid: '  NYA1  ', score: 1000 }], enrollments)
  assert.equal(row.student_id, 'student-1')
})

// Same alias edge case handled at login (first.lastname@ualberta.ca derives
// a ccid that isn't a real CCID). The row is never dropped or errored —
// it lands unmatched, same as any other unmatched CCID, for the
// instructor to resolve (fix ccid / skip row) in the validation UI.
test('alias-format-derived ccid with no matching enrollment flows to unmatched, not an error', async () => {
  const { matchCcids } = await ingest
  const rows = matchCcids([{ ccid: 'first.lastname', score: 1500 }], enrollments)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].student_id, null)
  assert.equal(rows[0].matchedName, null)
  assert.equal(rows[0].ccid, 'first.lastname') // row itself is preserved as-is
})

test('mixed batch: matched and unmatched rows both preserved, in order', async () => {
  const { matchCcids } = await ingest
  const rows = matchCcids(
    [
      { ccid: 'nya1', score: 1000 },
      { ccid: 'ghost', score: 500 },
      { ccid: 'jyang33', score: 975 },
    ],
    enrollments
  )
  assert.equal(rows.length, 3)
  assert.equal(rows[0].student_id, 'student-1')
  assert.equal(rows[1].student_id, null)
  assert.equal(rows[2].student_id, 'student-2')
})
