const test = require('node:test')
const assert = require('node:assert/strict')

const engine = import('../src/engine/analytics.js')

/*
Hand-calculated expectations for pearsonR.

Perfect positive: (1,2) (2,4) (3,6) -> y = 2x exactly -> r = 1
Perfect negative: (1,6) (2,4) (3,2) -> y = 8-2x exactly -> r = -1
No variance in x: (5,1) (5,2) (5,3) -> denX = 0 -> null (undefined, not 0)
Fewer than 2 points -> null
*/
test('pearsonR: perfect positive correlation', async () => {
  const { pearsonR } = await engine
  assert.equal(pearsonR([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }]), 1)
})

test('pearsonR: perfect negative correlation', async () => {
  const { pearsonR } = await engine
  assert.equal(pearsonR([{ x: 1, y: 6 }, { x: 2, y: 4 }, { x: 3, y: 2 }]), -1)
})

test('pearsonR: zero variance in one series -> null, not 0', async () => {
  const { pearsonR } = await engine
  assert.equal(pearsonR([{ x: 5, y: 1 }, { x: 5, y: 2 }, { x: 5, y: 3 }]), null)
})

test('pearsonR: fewer than 2 pairs -> null', async () => {
  const { pearsonR } = await engine
  assert.equal(pearsonR([]), null)
  assert.equal(pearsonR([{ x: 1, y: 1 }]), null)
})

/*
Hand-calculated weeklyParticipationByCategory:
weeksTotal = 2. activityTypesById: discussion -> individual, wuclap -> large_scale.
events:
  s1 discussion week1
  s1 discussion week1  (same student, same category, same week -> counts once)
  s2 wuclap      week1
  s1 wuclap      week2
  s3 discussion  week2
Expected:
  week1: individual = {s1} = 1, large_scale = {s2} = 1
  week2: individual = {s3} = 1, large_scale = {s1} = 1
*/
test('weeklyParticipationByCategory: distinct-student counts per week per category, dedup within week', async () => {
  const { weeklyParticipationByCategory } = await engine
  const activityTypesById = new Map([
    ['discussion', { category: 'individual' }],
    ['wuclap', { category: 'large_scale' }],
  ])
  const events = [
    { student_id: 's1', activity_type_id: 'discussion', week_number: 1 },
    { student_id: 's1', activity_type_id: 'discussion', week_number: 1 },
    { student_id: 's2', activity_type_id: 'wuclap', week_number: 1 },
    { student_id: 's1', activity_type_id: 'wuclap', week_number: 2 },
    { student_id: 's3', activity_type_id: 'discussion', week_number: 2 },
  ]
  const result = weeklyParticipationByCategory(events, activityTypesById, 2)
  assert.deepEqual(result, [
    { week: 1, individual: 1, large_scale: 1 },
    { week: 2, individual: 1, large_scale: 1 },
  ])
})

test('weeklyParticipationByCategory: zero-fills weeks with no events at all', async () => {
  const { weeklyParticipationByCategory } = await engine
  const activityTypesById = new Map([['discussion', { category: 'individual' }]])
  const result = weeklyParticipationByCategory([], activityTypesById, 3)
  assert.deepEqual(result, [
    { week: 1, individual: 0, large_scale: 0 },
    { week: 2, individual: 0, large_scale: 0 },
    { week: 3, individual: 0, large_scale: 0 },
  ])
})

/*
Hand-calculated classifyEngagementTier (defaults: minimalPointsMax=20,
comprehensiveIndividualShare=0.15):

| individual | large_scale | total | share | expected                    |
|-----------:|------------:|------:|------:|------------------------------|
| 0          | 0           | 0     | -     | minimal (total <= 20)        |
| 5          | 10          | 15    | -     | minimal (total <= 20)        |
| 5          | 45          | 50    | 0.10  | predominantly_large_scale    |
| 10         | 40          | 50    | 0.20  | comprehensive                |
| 7.5        | 42.5        | 50    | 0.15  | comprehensive (boundary, >=) |
| -5 (void)  | 30          | 30*   | 0     | predominantly_large_scale (individual clamped to 0, 30 > 20) |
*/
test('classifyEngagementTier: hand-calculated table', async () => {
  const { classifyEngagementTier } = await engine
  assert.equal(classifyEngagementTier(0, 0), 'minimal')
  assert.equal(classifyEngagementTier(5, 10), 'minimal')
  assert.equal(classifyEngagementTier(5, 45), 'predominantly_large_scale')
  assert.equal(classifyEngagementTier(10, 40), 'comprehensive')
  assert.equal(classifyEngagementTier(7.5, 42.5), 'comprehensive')
  assert.equal(classifyEngagementTier(-5, 30), 'predominantly_large_scale')
})

test('classifyEngagementTier: custom thresholds override the defaults', async () => {
  const { classifyEngagementTier } = await engine
  const strict = { minimalPointsMax: 0, comprehensiveIndividualShare: 0.5 }
  // total=2 > minimalPointsMax(0) -> not minimal; share=1/2=0.5 >= 0.5 -> comprehensive
  assert.equal(classifyEngagementTier(1, 1, strict), 'comprehensive')
  // under the DEFAULT thresholds the same inputs are minimal (total=2 <= 20)
  assert.equal(classifyEngagementTier(1, 1), 'minimal')
})

/*
Hand-calculated pointsByActivityType:
activityTypes (display order): discussion, wuclap
events: s1 discussion +5, s2 discussion +3, s1 wuclap +10, adjustment wuclap -15 (net wuclap = -5 -> clamps to 0)
Expected: [{id:'discussion', points: 8}, {id:'wuclap', points: 0}]
*/
test('pointsByActivityType: sums across all students, clamps a net-negative type at 0', async () => {
  const { pointsByActivityType } = await engine
  const activityTypes = [
    { id: 'discussion', label: 'Discussion', category: 'individual' },
    { id: 'wuclap', label: 'WuClap', category: 'large_scale' },
  ]
  const events = [
    { student_id: 's1', activity_type_id: 'discussion', points: 5 },
    { student_id: 's2', activity_type_id: 'discussion', points: 3 },
    { student_id: 's1', activity_type_id: 'wuclap', points: 10 },
    { student_id: 's1', activity_type_id: 'wuclap', points: -15 },
  ]
  assert.deepEqual(pointsByActivityType(events, activityTypes), [
    { id: 'discussion', label: 'Discussion', points: 8 },
    { id: 'wuclap', label: 'WuClap', points: 0 },
  ])
})

/*
Hand-calculated pointsVsGrade:
events give season totals: s1=100, s2=50, s3=0 (no events at all).
gradebookRows: s1->90, s2->70, s3->60, plus an unmatched ccid (student_id
null) and an ungraded row (final_grade null) which must both be excluded.
pairs = [(100,90), (50,70), (0,60)] -- not perfectly linear, so just check
membership/count and that r is a number in (-1,1) via a looser exactness
check on the well-known non-trivial case below.
*/
test('pointsVsGrade: excludes unmatched ccids and ungraded rows, uses season totals', async () => {
  const { pointsVsGrade } = await engine
  const events = [
    { student_id: 's1', points: 60 },
    { student_id: 's1', points: 40 },
    { student_id: 's2', points: 50 },
    // s3 has zero events entirely -> must still appear with points: 0
  ]
  const gradebookRows = [
    { student_id: 's1', final_grade: 90 },
    { student_id: 's2', final_grade: 70 },
    { student_id: 's3', final_grade: 60 },
    { student_id: null, final_grade: 85 }, // unmatched ccid
    { student_id: 's4', final_grade: null }, // ungraded
  ]
  const { pairs, r } = pointsVsGrade(events, gradebookRows)
  assert.deepEqual(pairs, [
    { student_id: 's1', points: 100, grade: 90 },
    { student_id: 's2', points: 50, grade: 70 },
    { student_id: 's3', points: 0, grade: 60 },
  ])
  assert.equal(typeof r, 'number')
})

// Regression for the 2026-08-18 dev-data tour finding: a gradebook upload
// whose ccids never resolved to a real enrollment (every row's student_id
// is null — expected on dev data, since matching is against `enrollments`,
// not the `pending_enrollments` staging table). This must yield zero pairs
// and a null r, not a crash or a false zero-correlation reading — the same
// "not computable" contract as the zero-variance case above. This is what
// makes AnalyticsDashboard's scatter/tier charts fall into their
// "no matched+graded rows" empty state rather than rendering an empty-but-
// present chart.
test('pointsVsGrade: every gradebook row unmatched (student_id null) -> zero pairs, r stays null', async () => {
  const { pointsVsGrade } = await engine
  const events = [
    { student_id: 's1', points: 50 },
    { student_id: 's2', points: 30 },
  ]
  const gradebookRows = [
    { student_id: null, final_grade: 87.5 },
    { student_id: null, final_grade: 72.3 },
    { student_id: null, final_grade: 91.0 },
    { student_id: null, final_grade: null },
    { student_id: null, final_grade: 65.8 },
  ]
  const { pairs, r } = pointsVsGrade(events, gradebookRows)
  assert.deepEqual(pairs, [])
  assert.equal(r, null)
})

test('pointsVsGrade: perfect linear relationship yields r = 1', async () => {
  const { pointsVsGrade } = await engine
  const events = [
    { student_id: 's1', points: 10 },
    { student_id: 's2', points: 20 },
    { student_id: 's3', points: 30 },
  ]
  const gradebookRows = [
    { student_id: 's1', final_grade: 60 },
    { student_id: 's2', final_grade: 70 },
    { student_id: 's3', final_grade: 80 },
  ]
  const { r } = pointsVsGrade(events, gradebookRows)
  assert.equal(r, 1)
})

/*
Hand-calculated gradeDistributionByTier against the UAlberta letter-grade
DEFAULT_GRADE_BINS (A+ 90-100 / A 85-89.999 / A- 80-84.999 / B+ 77-79.999 /
B 73-76.999 / B- 70-72.999 / C+ 67-69.999 / C 63-66.999 / C- 60-62.999 /
D+ 55-59.999 / D 50-54.999 / F <50) — one distinct grade per bin so every
bin is exercised exactly once:

| grade | tier                       | bin |
|------:|----------------------------|-----|
| 95    | comprehensive              | A+  |
| 87    | minimal                    | A   |
| 82    | comprehensive              | A-  |
| 78    | predominantly_large_scale  | B+  |
| 74    | comprehensive              | B   |
| 71    | minimal                    | B-  |
| 68    | predominantly_large_scale  | C+  |
| 65    | comprehensive              | C   |
| 61    | minimal                    | C-  |
| 57    | predominantly_large_scale  | D+  |
| 52    | comprehensive              | D   |
| 30    | minimal                    | F   |
*/
test('gradeDistributionByTier: hand-calculated bin table (UAlberta letter grades)', async () => {
  const { gradeDistributionByTier } = await engine
  const gradedStudents = [
    { grade: 95, tier: 'comprehensive' },
    { grade: 87, tier: 'minimal' },
    { grade: 82, tier: 'comprehensive' },
    { grade: 78, tier: 'predominantly_large_scale' },
    { grade: 74, tier: 'comprehensive' },
    { grade: 71, tier: 'minimal' },
    { grade: 68, tier: 'predominantly_large_scale' },
    { grade: 65, tier: 'comprehensive' },
    { grade: 61, tier: 'minimal' },
    { grade: 57, tier: 'predominantly_large_scale' },
    { grade: 52, tier: 'comprehensive' },
    { grade: 30, tier: 'minimal' },
  ]
  assert.deepEqual(gradeDistributionByTier(gradedStudents), [
    { label: 'A+', comprehensive: 1, predominantly_large_scale: 0, minimal: 0 },
    { label: 'A', comprehensive: 0, predominantly_large_scale: 0, minimal: 1 },
    { label: 'A-', comprehensive: 1, predominantly_large_scale: 0, minimal: 0 },
    { label: 'B+', comprehensive: 0, predominantly_large_scale: 1, minimal: 0 },
    { label: 'B', comprehensive: 1, predominantly_large_scale: 0, minimal: 0 },
    { label: 'B-', comprehensive: 0, predominantly_large_scale: 0, minimal: 1 },
    { label: 'C+', comprehensive: 0, predominantly_large_scale: 1, minimal: 0 },
    { label: 'C', comprehensive: 1, predominantly_large_scale: 0, minimal: 0 },
    { label: 'C-', comprehensive: 0, predominantly_large_scale: 0, minimal: 1 },
    { label: 'D+', comprehensive: 0, predominantly_large_scale: 1, minimal: 0 },
    { label: 'D', comprehensive: 1, predominantly_large_scale: 0, minimal: 0 },
    { label: 'F', comprehensive: 0, predominantly_large_scale: 0, minimal: 1 },
  ])
})

test('gradeDistributionByTier: a grade outside every bin is dropped, not miscounted', async () => {
  const { gradeDistributionByTier } = await engine
  const result = gradeDistributionByTier([{ grade: 150, tier: 'comprehensive' }])
  const total = result.reduce((s, b) => s + b.comprehensive + b.predominantly_large_scale + b.minimal, 0)
  assert.equal(total, 0)
})

test('gradeHistogram: plain counts per bin (UAlberta letter grades), duplicates collapse into the same finer bin', async () => {
  const { gradeHistogram } = await engine
  // 95 and 91 both land in A+ now that the scale is finer than the old
  // coarse "90-100" bucket — exercises that two distinct values can still
  // collapse into one bin.
  const result = gradeHistogram([95, 91, 82, 65, 40, 40])
  assert.deepEqual(result, [
    { label: 'A+', count: 2 }, // 95, 91
    { label: 'A', count: 0 },
    { label: 'A-', count: 1 }, // 82
    { label: 'B+', count: 0 },
    { label: 'B', count: 0 },
    { label: 'B-', count: 0 },
    { label: 'C+', count: 0 },
    { label: 'C', count: 1 }, // 65
    { label: 'C-', count: 0 },
    { label: 'D+', count: 0 },
    { label: 'D', count: 0 },
    { label: 'F', count: 2 }, // 40, 40
  ])
})

/*
Hand-calculated studentCategoryTotals:
events: s1 discussion(+5,individual) discussion(+3,individual) wuclap(+10,large_scale)
        s2 wuclap(+7,large_scale)
Expected: s1 -> {individual:8, large_scale:10}, s2 -> {individual:0, large_scale:7}
*/
test('studentCategoryTotals: splits and sums per student per category', async () => {
  const { studentCategoryTotals } = await engine
  const activityTypesById = new Map([
    ['discussion', { category: 'individual' }],
    ['wuclap', { category: 'large_scale' }],
  ])
  const events = [
    { student_id: 's1', activity_type_id: 'discussion', points: 5 },
    { student_id: 's1', activity_type_id: 'discussion', points: 3 },
    { student_id: 's1', activity_type_id: 'wuclap', points: 10 },
    { student_id: 's2', activity_type_id: 'wuclap', points: 7 },
  ]
  const totals = studentCategoryTotals(events, activityTypesById)
  assert.deepEqual(totals.get('s1'), { individual: 8, large_scale: 10 })
  assert.deepEqual(totals.get('s2'), { individual: 0, large_scale: 7 })
})
