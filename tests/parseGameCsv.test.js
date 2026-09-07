const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ingest = import('../src/ingest/parseGameCsv.js')

const fixture = fs.readFileSync(
  path.join(__dirname, '../docs/samples/game_results_sample.csv'),
  'utf8'
)

/*
Hand-checked expectations against docs/samples/game_results_sample.csv:

line 1: header — not a data row
lines 2-7: six players, ccid + score straight from the columns (contract:
  docs/fml_data_model.md §4 "Game results export contract")
  mstacker   -> score 4820
  tetrisace  -> score 4510
  blockbust  -> score 4510 (tie with tetrisace — fine, ranking is
                rankResultRows' job, not the parser's)
  centwiz    -> score 3990
  shapeshft  -> score 3200
  lastplace  -> score 150

-> 6 rows, 0 errors, 0 notices. No footer/blank rows in this format
   (Ahmed controls the exporter — no WuClap-style trailing "Average" row).
*/

test('fixture: 6 rows, no errors, no notices', async () => {
  const { parseGameCsv } = await ingest
  const { rows, errors, notices } = parseGameCsv(fixture)
  assert.equal(errors.length, 0)
  assert.equal(notices.length, 0)
  assert.equal(rows.length, 6)
  assert.deepEqual(
    rows.map((r) => [r.ccid, r.score]),
    [
      ['mstacker', 4820],
      ['tetrisace', 4510],
      ['blockbust', 4510],
      ['centwiz', 3990],
      ['shapeshft', 3200],
      ['lastplace', 150],
    ]
  )
})

test('empty file: no rows, no errors', async () => {
  const { parseGameCsv } = await ingest
  const { rows, errors, notices } = parseGameCsv('ccid,score\n')
  assert.equal(rows.length, 0)
  assert.equal(errors.length, 0)
  assert.equal(notices.length, 0)
})

test('duplicate ccid: keep-best (higher score survives), reported as a notice not an error', async () => {
  const { parseGameCsv } = await ingest
  const csv = 'ccid,score\ndupe,600\ndupe,900\n'
  const { rows, errors, notices } = parseGameCsv(csv)
  assert.equal(errors.length, 0)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].ccid, 'dupe')
  assert.equal(rows[0].score, 900)
  assert.equal(notices.length, 1)
  assert.match(notices[0].message, /duplicate ccid "dupe"/)
})

test('duplicate ccid, reverse order: keep-best still picks the higher score, not the last row', async () => {
  const { parseGameCsv } = await ingest
  const csv = 'ccid,score\ndupe,900\ndupe,600\n'
  const { rows } = parseGameCsv(csv)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].score, 900)
})

test('non-numeric score is reported, not silently dropped', async () => {
  const { parseGameCsv } = await ingest
  const csv = 'ccid,score\nbadscore,N/A\n'
  const { rows, errors } = parseGameCsv(csv)
  assert.equal(rows.length, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /non-numeric score/)
})

test('missing ccid is reported, not silently dropped', async () => {
  const { parseGameCsv } = await ingest
  const csv = 'ccid,score\n,500\n'
  const { rows, errors } = parseGameCsv(csv)
  assert.equal(rows.length, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /missing ccid/)
})

test('blank score (participated, unranked) is null, not an error', async () => {
  const { parseGameCsv } = await ingest
  const csv = 'ccid,score\nnoscore,\n'
  const { rows, errors } = parseGameCsv(csv)
  assert.equal(errors.length, 0)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].score, null)
})

test('ccid is lowercased and trimmed', async () => {
  const { parseGameCsv } = await ingest
  const csv = 'ccid,score\n  MixedCase  ,700\n'
  const { rows } = parseGameCsv(csv)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].ccid, 'mixedcase')
})
