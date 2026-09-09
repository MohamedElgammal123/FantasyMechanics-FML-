const test = require('node:test')
const assert = require('node:assert/strict')

const engine = import('../src/engine/claims.js')

/*
Hand-calculated expected values.

Escalation — correct_mistakes rule: base=2, step=1, cap=5
| nth (same lecture) | raw = 2 + 1*(nth-1) | expected            |
|--------------------|---------------------|---------------------|
| 1                  | 2                   | 2                   |
| 2                  | 3                   | 3                   |
| 3                  | 4                   | 4                   |
| 4                  | 5                   | 5 (reaches cap)     |
| 5                  | 6                   | 5 (capped)          |
No cap (cap=null): nth 5 → 6.
Flat rule (step=0, base=3): every nth → 3.

Escalation slots (nthClaimIndex) — counts pending + approved only, scoped
per (activity_type, lecture_date):
| existing claims                                        | next index |
|--------------------------------------------------------|------------|
| cm Mar 2 pending, cm Mar 2 approved                    | 3          |
| cm Mar 2 REJECTED, cm Mar 2 approved                   | 2          |
| (same two claims, asking for Mar 4)                    | 1          |
| cm Mar 2 approved + discussion Mar 2 approved (for cm) | 2          |

Weekly cap — cap=10, all existing claims in week 5, checking week 5.
Blocked when existing + new > cap (landing exactly on cap allowed).
Approved count awarded ?? computed; pending count computed; rejected nothing.
| existing (counted Σ)                                | new | Σ+new | result  |
|-----------------------------------------------------|-----|-------|---------|
| approved 3 + pending 4            (7)               | 3   | 10    | allowed |
| approved 3 + pending 4 + pending 2 (9)              | 2   | 11    | blocked |
| approved 3 + pending 4 + pending 3 (10)             | 2   | 12    | blocked |
| approved 3 + rejected 8           (3)               | 5   | 8     | allowed |
| approved: computed 3, awarded 10  (10)              | 1   | 11    | blocked |
| same claims but checking week 6   (0)               | 5   | 5     | allowed |
| cap = null                                          | any | —     | allowed |
*/

const cmRule = { base_points: 2, escalation_step: 1, escalation_cap: 5 }

test('escalation: base=2 step=1 cap=5', async () => {
  const { claimValue } = await engine
  assert.equal(claimValue(cmRule, 1), 2)
  assert.equal(claimValue(cmRule, 2), 3)
  assert.equal(claimValue(cmRule, 3), 4)
  assert.equal(claimValue(cmRule, 4), 5) // reaches cap: 2 + 3 = 5
  assert.equal(claimValue(cmRule, 5), 5) // min(6, 5) — capped
})

test('escalation: no cap keeps climbing', async () => {
  const { claimValue } = await engine
  const uncapped = { base_points: 2, escalation_step: 1, escalation_cap: null }
  assert.equal(claimValue(uncapped, 5), 6)
})

test('escalation: step=0 is flat', async () => {
  const { claimValue } = await engine
  const discussion = { base_points: 3, escalation_step: 0, escalation_cap: null }
  assert.equal(claimValue(discussion, 1), 3)
  assert.equal(claimValue(discussion, 4), 3)
})

const mar2Pending = { activity_type_id: 'correct_mistakes', lecture_date: '2027-03-02', status: 'pending' }
const mar2Approved = { activity_type_id: 'correct_mistakes', lecture_date: '2027-03-02', status: 'approved' }
const mar2Rejected = { activity_type_id: 'correct_mistakes', lecture_date: '2027-03-02', status: 'rejected' }
const mar2Discussion = { activity_type_id: 'discussion', lecture_date: '2027-03-02', status: 'approved' }

test('nthClaimIndex counts pending + approved for the same lecture/activity', async () => {
  const { nthClaimIndex } = await engine
  assert.equal(nthClaimIndex([mar2Pending, mar2Approved], 'correct_mistakes', '2027-03-02'), 3)
})

test('nthClaimIndex: rejected claims do not consume escalation slots', async () => {
  const { nthClaimIndex } = await engine
  assert.equal(nthClaimIndex([mar2Rejected, mar2Approved], 'correct_mistakes', '2027-03-02'), 2)
})

test('nthClaimIndex: counter resets per lecture date', async () => {
  const { nthClaimIndex } = await engine
  assert.equal(nthClaimIndex([mar2Pending, mar2Approved], 'correct_mistakes', '2027-03-04'), 1)
})

test('nthClaimIndex: other activity types do not advance the counter', async () => {
  const { nthClaimIndex } = await engine
  assert.equal(nthClaimIndex([mar2Approved, mar2Discussion], 'correct_mistakes', '2027-03-02'), 2)
})

// week-5 claim fixtures for the cap checks
const wk5 = (status, computed, awarded = null) =>
  ({ week_number: 5, status, computed_points: computed, awarded_points: awarded })

test('weekly cap: landing exactly on the cap is allowed', async () => {
  const { checkWeeklyCap } = await engine
  const existing = [wk5('approved', 3), wk5('pending', 4)] // Σ = 7
  const r = checkWeeklyCap(existing, 5, 10, 3) // 7 + 3 = 10 ≤ 10
  assert.equal(r.blocked, false)
  assert.equal(r.used, 7)
})

test('weekly cap: overshoot is blocked', async () => {
  const { checkWeeklyCap } = await engine
  const existing = [wk5('approved', 3), wk5('pending', 4), wk5('pending', 2)] // Σ = 9
  const r = checkWeeklyCap(existing, 5, 10, 2) // 9 + 2 = 11 > 10
  assert.equal(r.blocked, true)
  assert.equal(r.used, 9)
})

test('weekly cap: blocked mid-week once existing claims fill the cap', async () => {
  const { checkWeeklyCap } = await engine
  const existing = [wk5('approved', 3), wk5('pending', 4), wk5('pending', 3)] // Σ = 10
  assert.equal(checkWeeklyCap(existing, 5, 10, 2).blocked, true) // 12 > 10
})

test('weekly cap: rejected claims do not count', async () => {
  const { checkWeeklyCap } = await engine
  const existing = [wk5('approved', 3), wk5('rejected', 8)] // Σ = 3
  const r = checkWeeklyCap(existing, 5, 10, 5) // 3 + 5 = 8 ≤ 10
  assert.equal(r.blocked, false)
  assert.equal(r.used, 3)
})

test('weekly cap: instructor override (awarded_points) counts for approved claims', async () => {
  const { checkWeeklyCap } = await engine
  const existing = [wk5('approved', 3, 10)] // counts awarded 10, not computed 3
  const r = checkWeeklyCap(existing, 5, 10, 1) // 10 + 1 = 11 > 10
  assert.equal(r.blocked, true)
  assert.equal(r.used, 10)
})

test('weekly cap: resets on week rollover', async () => {
  const { checkWeeklyCap } = await engine
  const existing = [wk5('approved', 3), wk5('pending', 4), wk5('pending', 3)]
  const r = checkWeeklyCap(existing, 6, 10, 5) // week 6: Σ = 0, 0 + 5 ≤ 10
  assert.equal(r.blocked, false)
  assert.equal(r.used, 0)
})

test('weekly cap: null cap never blocks', async () => {
  const { checkWeeklyCap } = await engine
  const existing = [wk5('approved', 50), wk5('pending', 50)]
  assert.equal(checkWeeklyCap(existing, 5, null, 100).blocked, false)
})
