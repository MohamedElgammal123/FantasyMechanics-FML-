const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ingest = import('../src/ingest/parseWuclapCsv.js')

const fixture = fs.readFileSync(
  path.join(__dirname, '../docs/samples/wuclap_results_sample.csv'),
  'utf8'
)

/*
Hand-checked expectations against docs/samples/wuclap_results_sample.csv:

line 1: header — not a data row
lines 2-7: six students, ccid = local-part of Email lowercased, score = "Points ??"
  nya1@ualberta.ca      -> ccid nya1,      score 1000
  jyang33@ualberta.ca   -> ccid jyang33,   score 975
  samrit@ualberta.ca    -> ccid samrit,    score 975
  mknorth@ualberta.ca   -> ccid mknorth,   score 0
  nunezgon@ualberta.ca  -> ccid nunezgon,  score 950
  mitwasi@ualberta.ca   -> ccid mitwasi,   score 2000
line 8: "Average" footer row — empty Email, skipped
line 9: blank line — skipped

-> 6 rows, 0 errors, 0 notices (this real export has no duplicate ccid;
   the dedup path is covered separately below with a synthetic snippet
   per Ahmed's call — hand-editing a fake duplicate into the fixture
   would dilute its value as a faithful copy of a real export).
*/

test('real WuClap fixture: 6 rows, no errors, no notices, footer + blank rows skipped', async () => {
  const { parseWuclapCsv } = await ingest
  const { rows, errors, notices } = parseWuclapCsv(fixture)
  assert.equal(errors.length, 0)
  assert.equal(notices.length, 0)
  assert.equal(rows.length, 6)
  assert.deepEqual(
    rows.map((r) => [r.ccid, r.score]),
    [
      ['nya1', 1000],
      ['jyang33', 975],
      ['samrit', 975],
      ['mknorth', 0],
      ['nunezgon', 950],
      ['mitwasi', 2000],
    ]
  )
})

test('empty file: no rows, no errors', async () => {
  const { parseWuclapCsv } = await ingest
  const { rows, errors, notices } = parseWuclapCsv(
    '#,Username,First name,Last name,Email,Total,Points ??\n'
  )
  assert.equal(rows.length, 0)
  assert.equal(errors.length, 0)
  assert.equal(notices.length, 0)
})

// Synthetic — the real fixture has no duplicate. Per Ahmed: inline snippet
// here, not hand-edited into the shared fixture. If a real duplicate ever
// shows up in a live export, it becomes a second fixture and this test
// gets pinned to reality then.
test('duplicate ccid: keep-best (higher score survives), reported as a notice not an error', async () => {
  const { parseWuclapCsv } = await ingest
  const csv =
    '#,Username,First name,Last name,Email,Total,Points ??\n' +
    '1,Dupe One,Dupe,One,dupe@ualberta.ca,1 / 3,600\n' +
    '2,Dupe Two,Dupe,Two,dupe@ualberta.ca,2 / 3,900\n'
  const { rows, errors, notices } = parseWuclapCsv(csv)
  assert.equal(errors.length, 0)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].ccid, 'dupe')
  assert.equal(rows[0].score, 900) // higher score wins, regardless of row order
  assert.equal(notices.length, 1)
  assert.match(notices[0].message, /duplicate ccid "dupe"/)
})

test('duplicate ccid, reverse order: keep-best still picks the higher score, not the last row', async () => {
  const { parseWuclapCsv } = await ingest
  const csv =
    '#,Username,First name,Last name,Email,Total,Points ??\n' +
    '1,Dupe One,Dupe,One,dupe@ualberta.ca,2 / 3,900\n' +
    '2,Dupe Two,Dupe,Two,dupe@ualberta.ca,1 / 3,600\n'
  const { rows } = parseWuclapCsv(csv)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].score, 900) // first row had the higher score and stays, despite not being last
})

// The alias-format email itself isn't a parser-level problem — it's a
// well-formed email, so it parses like any other row. Whether its derived
// ccid actually matches a real student is matchCcids' job (see
// tests/matchCcids.test.js), not the parser's.
test('alias-format email parses normally, ccid is just its local-part', async () => {
  const { parseWuclapCsv } = await ingest
  const csv =
    '#,Username,First name,Last name,Email,Total,Points ??\n' +
    '1,Alias Student,Alias,Student,first.lastname@ualberta.ca,3 / 3,1500\n'
  const { rows, errors } = parseWuclapCsv(csv)
  assert.equal(errors.length, 0)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].ccid, 'first.lastname')
})

test('non-numeric score is reported, not silently dropped', async () => {
  const { parseWuclapCsv } = await ingest
  const csv =
    '#,Username,First name,Last name,Email,Total,Points ??\n' +
    '1,Bad Score,Bad,Score,badscore@ualberta.ca,1 / 3,N/A\n'
  const { rows, errors } = parseWuclapCsv(csv)
  assert.equal(rows.length, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /non-numeric score/)
})

test('malformed email is reported, not silently dropped', async () => {
  const { parseWuclapCsv } = await ingest
  const csv =
    '#,Username,First name,Last name,Email,Total,Points ??\n' +
    '1,No At Sign,No,AtSign,not-an-email,1 / 3,500\n'
  const { rows, errors } = parseWuclapCsv(csv)
  assert.equal(rows.length, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /malformed email/)
})

test('blank score (participated, unranked) is null, not an error', async () => {
  const { parseWuclapCsv } = await ingest
  const csv =
    '#,Username,First name,Last name,Email,Total,Points ??\n' +
    '1,No Score,No,Score,noscore@ualberta.ca,0 / 3,\n'
  const { rows, errors } = parseWuclapCsv(csv)
  assert.equal(errors.length, 0)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].score, null)
})
