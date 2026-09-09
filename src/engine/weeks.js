// Mirror of SQL week_number_for (supabase/migrations/0001_initial_schema.sql):
//   greatest(1, least(weeks_total, floor(epoch(at - week1_start) / 604800) + 1))
// week1_start is a DATE interpreted at midnight UTC (the DB runs in UTC), so
// this is pure epoch-seconds division — no calendar or local-time math, which
// keeps the JS and SQL mirrors identical across DST transitions.

const WEEK_SECONDS = 604800

// week1Start: 'YYYY-MM-DD'; at: Date or ISO string.
export function weekNumberFor(week1Start, weeksTotal, at) {
  const startMs = Date.parse(`${week1Start}T00:00:00Z`)
  const atMs = at instanceof Date ? at.getTime() : Date.parse(at)
  const elapsedSeconds = (atMs - startMs) / 1000
  const raw = Math.floor(elapsedSeconds / WEEK_SECONDS) + 1
  return Math.max(1, Math.min(weeksTotal, raw))
}

// Exclusive end of week n: week1_start + n weeks of epoch seconds — the same
// instant weekNumberFor flips to n+1 (a cycle spanning weeks a–b ends at
// weekEndDate(week1Start, b)). Pure epoch math, same DST-immunity as above.
export function weekEndDate(week1Start, weekNumber) {
  const startMs = Date.parse(`${week1Start}T00:00:00Z`)
  return new Date(startMs + weekNumber * WEEK_SECONDS * 1000)
}
