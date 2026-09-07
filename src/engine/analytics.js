// P10 instructor analytics (data model §9). Computed on read from
// point_events + gradebook_rows — no stored analytics tables. Pure
// functions only; screens never aggregate directly.

// ---- correlation ----

// pairs: [{ x, y }]. null when fewer than 2 pairs or either series has zero
// variance — undefined correlation, not 0. A flat series (everyone scored
// the same) has no "no relationship" answer; don't fake one.
export function pearsonR(pairs) {
  const n = pairs.length
  if (n < 2) return null
  const meanX = pairs.reduce((s, p) => s + p.x, 0) / n
  const meanY = pairs.reduce((s, p) => s + p.y, 0) / n
  let num = 0
  let denX = 0
  let denY = 0
  for (const p of pairs) {
    const dx = p.x - meanX
    const dy = p.y - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  if (denX === 0 || denY === 0) return null
  return num / Math.sqrt(denX * denY)
}

// ---- weekly participation ----

// events: [{ student_id, activity_type_id, week_number }]. activityTypesById:
// Map(id -> { category }). Returns [{ week, individual, large_scale }] for
// weeks 1..weeksTotal — count of DISTINCT students with >=1 event of that
// category that week (participation, not point volume; repeat events by the
// same student in the same week+category count once).
export function weeklyParticipationByCategory(events, activityTypesById, weeksTotal) {
  const perWeek = new Map()
  for (let w = 1; w <= weeksTotal; w++) {
    perWeek.set(w, { individual: new Set(), large_scale: new Set() })
  }
  for (const e of events) {
    const bucket = perWeek.get(e.week_number)
    if (!bucket) continue // outside the term's week range — ignore defensively
    const type = activityTypesById.get(e.activity_type_id)
    if (!type) continue
    bucket[type.category].add(e.student_id)
  }
  return [...perWeek.entries()].map(([week, b]) => ({
    week,
    individual: b.individual.size,
    large_scale: b.large_scale.size,
  }))
}

// ---- engagement tiers ----

// v1 engagement-tier taxonomy (paper's Comprehensive / Predominantly
// Large-Scale / Minimal). Final v1 call (2026-08-18): kept as originally
// set, no source-paper cutoffs were available to calibrate against either
// time. minimalPointsMax=20 reads as "did almost nothing all term" for a
// typical curve (well under a single week's worth of full participation);
// comprehensiveIndividualShare=0.15 is deliberately low — the taxonomy is
// meant to catch students who engage with BOTH paths at all, not to
// require a near-even split, since large-scale (WuClap/games) will
// naturally dominate point totals for most students. Both are exposed as
// DEFAULT_ENGAGEMENT_TIER_THRESHOLDS and labeled instructor-tunable rather
// than wired to a settings screen (data model §9 leaves that for later).
export const DEFAULT_ENGAGEMENT_TIER_THRESHOLDS = {
  minimalPointsMax: 20, // total season points at/under this => minimal, regardless of mix
  comprehensiveIndividualShare: 0.15, // individual-category share needed to count as "comprehensive" rather than "predominantly large-scale"
}

// events -> Map(student_id -> { individual, large_scale }) points, split by
// activity_type category. Shared by tier classification and the scatter.
export function studentCategoryTotals(events, activityTypesById) {
  const totals = new Map()
  for (const e of events) {
    const type = activityTypesById.get(e.activity_type_id)
    if (!type) continue
    const row = totals.get(e.student_id) ?? { individual: 0, large_scale: 0 }
    row[type.category] += e.points
    totals.set(e.student_id, row)
  }
  return totals
}

// Points are clamped at 0 before classifying — a net-negative category from
// a void shouldn't read as "engaged".
export function classifyEngagementTier(individualPoints, largeScalePoints, thresholds = DEFAULT_ENGAGEMENT_TIER_THRESHOLDS) {
  const individual = Math.max(0, individualPoints)
  const largeScale = Math.max(0, largeScalePoints)
  const total = individual + largeScale
  if (total <= thresholds.minimalPointsMax) return 'minimal'
  const individualShare = individual / total
  return individualShare >= thresholds.comprehensiveIndividualShare ? 'comprehensive' : 'predominantly_large_scale'
}

// ---- points-by-activity-type (pie) ----

// events: the section's full ledger. activityTypes: [{ id, label, category }]
// in display order. Returns [{ id, label, points }] — summed across every
// student, clamped at 0 per type so a net-negative type (a void exceeding
// its original) never renders a negative pie slice.
export function pointsByActivityType(events, activityTypes) {
  const sums = new Map(activityTypes.map((a) => [a.id, 0]))
  for (const e of events) {
    if (!sums.has(e.activity_type_id)) continue
    sums.set(e.activity_type_id, sums.get(e.activity_type_id) + e.points)
  }
  return activityTypes.map((a) => ({
    id: a.id,
    label: a.label,
    points: Math.max(0, sums.get(a.id)),
  }))
}

// ---- points vs. grade ----

// gradebookRows: [{ student_id, final_grade }] from one gradebook_upload.
// Only rows with BOTH a matched student_id and a non-null final_grade
// contribute a pair — an unmatched ccid or an ungraded row is a real gap,
// not a zero; forcing it to 0 would bias r toward the origin.
export function pointsVsGrade(events, gradebookRows) {
  const totals = new Map()
  for (const e of events) totals.set(e.student_id, (totals.get(e.student_id) ?? 0) + e.points)
  const pairs = gradebookRows
    .filter((g) => g.student_id != null && g.final_grade != null)
    .map((g) => ({ student_id: g.student_id, points: totals.get(g.student_id) ?? 0, grade: g.final_grade }))
  const r = pearsonR(pairs.map((p) => ({ x: p.points, y: p.grade })))
  return { pairs, r }
}

// ---- grade distribution ----

// University of Alberta undergraduate letter-grade scale (per-course
// percentage bands, UAlberta Calendar "Grading System") — matches the
// paper's Figure 6 grade-distribution axis. F's floor is -Infinity rather
// than 0 so a data-entry typo (a negative percentage) still lands
// somewhere rather than being silently dropped as "outside every bin".
export const DEFAULT_GRADE_BINS = [
  { label: 'A+', min: 90, max: 100 },
  { label: 'A', min: 85, max: 89.999 },
  { label: 'A-', min: 80, max: 84.999 },
  { label: 'B+', min: 77, max: 79.999 },
  { label: 'B', min: 73, max: 76.999 },
  { label: 'B-', min: 70, max: 72.999 },
  { label: 'C+', min: 67, max: 69.999 },
  { label: 'C', min: 63, max: 66.999 },
  { label: 'C-', min: 60, max: 62.999 },
  { label: 'D+', min: 55, max: 59.999 },
  { label: 'D', min: 50, max: 54.999 },
  { label: 'F', min: -Infinity, max: 49.999 },
]

// gradedStudents: [{ grade, tier }] (tier from classifyEngagementTier).
// Returns one row per bin, zero-filled, in bin order. A grade outside every
// bin (a negative or >100 data-entry typo) is dropped, not miscounted into
// an edge bin — the raw upload should surface that, not this chart.
export function gradeDistributionByTier(gradedStudents, bins = DEFAULT_GRADE_BINS) {
  return bins.map((b) => {
    const row = { label: b.label, comprehensive: 0, predominantly_large_scale: 0, minimal: 0 }
    for (const s of gradedStudents) {
      if (s.grade < b.min || s.grade > b.max) continue
      row[s.tier] = (row[s.tier] ?? 0) + 1
    }
    return row
  })
}

// grades: number[]. Plain grade-distribution histogram — reused for both
// sides of the before/after comparison (caller renders them side by side).
export function gradeHistogram(grades, bins = DEFAULT_GRADE_BINS) {
  return bins.map((b) => ({
    label: b.label,
    count: grades.filter((g) => g >= b.min && g <= b.max).length,
  }))
}
