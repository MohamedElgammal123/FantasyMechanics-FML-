// Mirror of SQL curve_points (supabase/migrations/0001_initial_schema.sql).
// Any change here must change the SQL function too, and vice versa.

export function curvePoints(rank, curve) {
  const { top_points, step, ranked_cutoff, participation_floor } = curve
  if (rank == null) return participation_floor
  if (rank <= ranked_cutoff) return top_points - (rank - 1) * step
  return participation_floor
}

// Save-time invariant: the lowest curve point must not fall below the floor.
export function validateCurve(curve) {
  const { top_points, step, ranked_cutoff, participation_floor } = curve
  const lowest = top_points - (ranked_cutoff - 1) * step
  if (lowest < participation_floor) {
    return {
      ok: false,
      error: `lowest curve point ${lowest} (rank ${ranked_cutoff}) is below the participation floor ${participation_floor}`,
    }
  }
  return { ok: true }
}
