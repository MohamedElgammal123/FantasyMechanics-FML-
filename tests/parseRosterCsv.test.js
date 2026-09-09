const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ingest = import('../src/ingest/parseRosterCsv.js')

const fixture = fs.readFileSync(
  path.join(__dirname, '../docs/samples/canvas_roster_sample.csv'),
  'utf8'
)

/*
Hand-checked expectations against docs/samples/canvas_roster_sample.csv:

line 1: header — not a data row
line 2: blank line (",,,,")            → skipped, no error
line 3: "    Points Possible,,,,"      → skipped, no error (Canvas marker row)
line 4: Fakerson, Alice / afakerso     → { ccid: 'afakerso', fullName: 'Alice Fakerson' }
line 5: Testley, Bob / bteslety        → { ccid: 'bteslety', fullName: 'Bob Testley' }
line 6: Sample, Carol / csample1       → { ccid: 'csample1', fullName: 'Carol Sample' }
line 7: Mockford, Dana / dmockfor      → { ccid: 'dmockfor', fullName: 'Dana Mockford' }
line 8: Student, Test / <hash ccid>    → { ccid: '<hash, lowercased>', fullName: 'Test Student' }
        (an unusual Canvas test-student ccid — parser imports it as-is;
        matching/resolution is downstream's job, not the parser's)

→ 5 data rows, 0 errors.
*/

test('real Canvas fixture: 5 rows, no errors, blank + Points Possible rows skipped', async () => {
  const { parseRosterCsv } = await ingest
  const { rows, errors } = parseRosterCsv(fixture)
  assert.equal(errors.length, 0)
  assert.equal(rows.length, 5)
  assert.deepEqual(
    rows.map((r) => [r.ccid, r.fullName]),
    [
      ['afakerso', 'Alice Fakerson'],
      ['bteslety', 'Bob Testley'],
      ['csample1', 'Carol Sample'],
      ['dmockfor', 'Dana Mockford'],
      ['266e1986ce362ddb11dfb08ec104f12cd8cb8fa6', 'Test Student'],
    ]
  )
})

test('empty file: no rows, no errors', async () => {
  const { parseRosterCsv } = await ingest
  const { rows, errors } = parseRosterCsv('Student,ID,SIS User ID,SIS Login ID,Section\n')
  assert.equal(rows.length, 0)
  assert.equal(errors.length, 0)
})

test('row missing SIS Login ID is reported, not silently dropped', async () => {
  const { parseRosterCsv } = await ingest
  const csv =
    'Student,ID,SIS User ID,SIS Login ID,Section\n' + '"Ghost, Casper",100009,,,\n'
  const { rows, errors } = parseRosterCsv(csv)
  assert.equal(rows.length, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /missing SIS Login ID/)
})

test('row missing Student name is reported, not silently dropped', async () => {
  const { parseRosterCsv } = await ingest
  const csv = 'Student,ID,SIS User ID,SIS Login ID,Section\n' + ',100010,1000010,ghostid,\n'
  const { rows, errors } = parseRosterCsv(csv)
  assert.equal(rows.length, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /missing Student name/)
})

test('duplicate ccid: both rows flagged as errors, neither kept', async () => {
  const { parseRosterCsv } = await ingest
  const csv =
    'Student,ID,SIS User ID,SIS Login ID,Section\n' +
    '"One, Duplicate",100011,1000011,dupccid,\n' +
    '"Two, Duplicate",100012,1000012,DupCcid,\n' // case-insensitive duplicate
  const { rows, errors } = parseRosterCsv(csv)
  assert.equal(rows.length, 0)
  assert.equal(errors.length, 2)
  assert.ok(errors.every((e) => /duplicate ccid/.test(e.message)))
})

test('ccid normalized lower/trim', async () => {
  const { parseRosterCsv } = await ingest
  const csv = 'Student,ID,SIS User ID,SIS Login ID,Section\n' + '"Case, Mixed",100013,1000013,  MiXeDCase  ,\n'
  const { rows, errors } = parseRosterCsv(csv)
  assert.equal(errors.length, 0)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].ccid, 'mixedcase')
})
