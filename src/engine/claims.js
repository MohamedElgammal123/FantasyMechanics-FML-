// Claim escalation + weekly cap math (data model §6).

// value(nth) = min(base + step*(nth-1), cap ?? Infinity)
export function claimValue(rule, nth) {
  const { base_points, escalation_step, escalation_cap } = rule
  const raw = base_points + escalation_step * (nth - 1)
  return escalation_cap == null ? raw : Math.min(raw, escalation_cap)
}

// 1-based index the NEXT claim would occupy for this (activity, lecture_date).
// Rejected claims do not consume escalation slots: only pending + approved count.
export function nthClaimIndex(existingClaims, activityTypeId, lectureDate) {
  const live = existingClaims.filter(c =>
    c.activity_type_id === activityTypeId &&
    c.lecture_date === lectureDate &&
    (c.status === 'pending' || c.status === 'approved')
  )
  return live.length + 1
}

// Blocked when existing counted points + the new claim's value would exceed
// the cap; landing exactly on the cap is allowed. Approved claims count
// awarded_points ?? computed_points; pending count computed_points; rejected
// count nothing. Instructor grants are adjustment events, never claims, so
// they can't reach this function. Null cap never blocks.
export function checkWeeklyCap(existingClaims, weekNumber, cap, newClaimValue) {
  const used = existingClaims.reduce((sum, c) => {
    if (c.week_number !== weekNumber) return sum
    if (c.status === 'approved') return sum + (c.awarded_points ?? c.computed_points)
    if (c.status === 'pending') return sum + c.computed_points
    return sum
  }, 0)
  const blocked = cap != null && used + newClaimValue > cap
  return { blocked, used }
}
