const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ingest = import('../src/ingest/parseGradebookCsv.js')

const fixture = fs.readFileSync(
  path.join(__dirname, '../docs/samples/gradebook_sample.csv'),
  'utf8'
)

/*
Hand-checked expectations against docs/samples/gradebook_sample.csv:

line 1: header — not a data row
line 2: blank row — skipped
line 3: "Points Possible" marker row — skipped (empty SIS Login ID)
line 4: Fakerson, Alice -> ccid afakerso, finalGrade 87.5, letterGrade "A"
line 5: Testley, Bob    -> ccid bteslety, finalGrade 72.3, letterGrade "B-"
line 6: Sample, Carol   -> ccid csample1, finalGrade 91.0, letterGrade "A+"
line 7: Mockford, Dana  -> ccid dmockfor, finalGrade null (ungraded), letterGrade null
line 8: Newcomb, Evan   -> ccid enewcomb, finalGrade 65.8, letterGrade "C+" (not in roster fixture -> unmatched at match-time, not a parse error)

-> 5 rows, 0 errors
*/

test('real gradebook fixture: 5 rows, no errors, blank + Points Possible rows skipped', async () => {
  const { parseGradebookCsv } = await ingest
  const { rows, errors } = parseGradebookCsv(fixture)
  assert.equal(errors.length, 0)
  assert.equal(rows.length, 5)
  assert.deepEqual(
    rows.map((r) => [r.ccid, r.fullName, r.finalGrade, r.letterGrade]),
    [
      ['afakerso', 'Alice Fakerson', 87.5, 'A'],
      ['bteslety', 'Bob Testley', 72.3, 'B-'],
      ['csample1', 'Carol Sample', 91.0, 'A+'],
      ['dmockfor', 'Dana Mockford', null, null],
      ['enewcomb', 'Evan Newcomb', 65.8, 'C+'],
    ]
  )
})

test('empty file: no rows, no errors', async () => {
  const { parseGradebookCsv } = await ingest
  const { rows, errors } = parseGradebookCsv('Student,ID,SIS User ID,SIS Login ID,Section,Final Score,Final Grade\n')
  assert.equal(rows.length, 0)
  assert.equal(errors.length, 0)
})

test('blank Final Score is null (ungraded), not an error', async () => {
  const { parseGradebookCsv } = await ingest
  const csv =
    'Student,ID,SIS User ID,SIS Login ID,Section,Final Score,Final Grade\n' +
    '"Ungraded, Uma",1,1,uungrade,SEC,,\n'
  const { rows, errors } = parseGradebookCsv(csv)
  assert.equal(errors.length, 0)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].finalGrade, null)
  assert.equal(rows[0].letterGrade, null)
})

test('non-numeric Final Score is reported, not silently dropped', async () => {
  const { parseGradebookCsv } = await ingest
  const csv =
    'Student,ID,SIS User ID,SIS Login ID,Section,Final Score,Final Grade\n' +
    '"Bad, Score",1,1,bscore,SEC,N/A,\n'
  const { rows, errors } = parseGradebookCsv(csv)
  assert.equal(rows.length, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /non-numeric Final Score/)
})

test('missing SIS Login ID is reported, not silently dropped', async () => {
  const { parseGradebookCsv } = await ingest
  const csv =
    'Student,ID,SIS User ID,SIS Login ID,Section,Final Score,Final Grade\n' +
    '"No, Ccid",1,1,,SEC,80,B\n'
  const { rows, errors } = parseGradebookCsv(csv)
  assert.equal(rows.length, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /missing SIS Login ID/)
})

test('missing Student name is reported, not silently dropped', async () => {
  const { parseGradebookCsv } = await ingest
  const csv =
    'Student,ID,SIS User ID,SIS Login ID,Section,Final Score,Final Grade\n' +
    ',1,1,noname,SEC,80,B\n'
  const { rows, errors } = parseGradebookCsv(csv)
  assert.equal(rows.length, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /missing Student name/)
})

// Synthetic — the real fixture has no duplicate ccid, same rationale as
// parseWuclapCsv.test.js / parseRosterCsv.test.js: don't dilute the fixture
// with a hand-edited data-integrity problem.
test('duplicate ccid: both rows dropped and reported (data problem, not an export artifact)', async () => {
  const { parseGradebookCsv } = await ingest
  const csv =
    'Student,ID,SIS User ID,SIS Login ID,Section,Final Score,Final Grade\n' +
    '"Dupe, One",1,1,dupe,SEC,70,B-\n' +
    '"Dupe, Two",2,2,dupe,SEC,90,A\n'
  const { rows, errors } = parseGradebookCsv(csv)
  assert.equal(rows.length, 0)
  assert.equal(errors.length, 2)
  assert.match(errors[0].message, /duplicate ccid "dupe"/)
  assert.match(errors[1].message, /duplicate ccid "dupe"/)
})
