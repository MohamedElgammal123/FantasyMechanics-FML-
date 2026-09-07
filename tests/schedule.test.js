const test = require('node:test')
const assert = require('node:assert/strict')

const engine = import('../src/engine/schedule.js')
const standings = import('../src/engine/standings.js')

/*
P8 scheduling engine — hand-calculated tables approved 2026-08-15 (D1–D4 per
recommendations). Shared fixture: week1_start = 2027-01-04 (Mon), weeks_total
= 13. End of week n = Jan 4 + n*604800 s (epoch UTC, no calendar math):
wk1 → Jan 11, wk2 → Jan 18, wk5 → Feb 8, wk6 → Feb 15, wk13 → Apr 5.

Concurrency note: the true two-simultaneous-runs case (advisory locks) is a
DB-level property tested at the parity stage. The engine-level analog pinned
here: every planner applied to its own post-state plans NOTHING — an empty
plan is what a concurrent second invocation must resolve to.
*/

const W1 = '2027-01-04'
const WEEKS = 13

/*
Table F — cycle generation. floor(weeks_total/2) cycles of (2k−1, 2k);
odd tail week gets no cycle (D1: week 13 uncycled, matches the seed's 6).

| weeks_total | cycles                              |
|-------------|-------------------------------------|
| 13          | (1–2)(3–4)(5–6)(7–8)(9–10)(11–12)   |
| 4           | (1–2)(3–4)                          |
| 1           | none (degenerate, must not error)   |
*/

test('Table F: 13 weeks → 6 cycles, week 13 uncycled (D1)', async () => {
  const { generateCyclePlan } = await engine
  assert.deepEqual(generateCyclePlan(13), [
    { number: 1, week_start: 1, week_end: 2 },
    { number: 2, week_start: 3, week_end: 4 },
    { number: 3, week_start: 5, week_end: 6 },
    { number: 4, week_start: 7, week_end: 8 },
    { number: 5, week_start: 9, week_end: 10 },
    { number: 6, week_start: 11, week_end: 12 },
  ])
})

test('Table F: even and degenerate weeks_total', async () => {
  const { generateCyclePlan } = await engine
  assert.deepEqual(generateCyclePlan(4), [
    { number: 1, week_start: 1, week_end: 2 },
    { number: 2, week_start: 3, week_end: 4 },
  ])
  assert.deepEqual(generateCyclePlan(1), [])
})

/*
Table A — cycle finalization due-check on raw instants (never clamped weeks;
the clamp is for attribution, not scheduling). Cycle 1 (weeks 1–2) boundary
= 2027-01-18T00:00:00Z. The boundary instant is inclusive-due (cycle
finalizable) and exclusive-attribution (an event AT the boundary is week 3 —
pinned in weeks.test.js).

Latch pin: a cycle with finalized_at set is NEVER due again, even long past
its boundary — re-evaluation of finalized cycles is impossible by predicate.

| now (UTC)             | due cycles (of c1 wk1–2, c2 wk3–4, c3 wk5–6 FINALIZED) |
|-----------------------|--------------------------------------------------------|
| 2027-01-03T00:00:00Z  | none (pre-term)                                        |
| 2027-01-17T23:59:59Z  | none                                                   |
| 2027-01-18T00:00:00Z  | c1                                                     |
| 2027-05-01T00:00:00Z  | c1, c2 — NOT c3 (latch)                                |
*/

const cyclesFixture = [
  { id: 'c1', number: 1, week_start: 1, week_end: 2, finalized_at: null },
  { id: 'c2', number: 2, week_start: 3, week_end: 4, finalized_at: null },
  { id: 'c3', number: 3, week_start: 5, week_end: 6, finalized_at: '2027-02-20T00:00:00Z' },
]

test('Table A: nothing due before the boundary instant', async () => {
  const { dueUnfinalizedCycles } = await engine
  assert.deepEqual(dueUnfinalizedCycles(cyclesFixture, W1, '2027-01-03T00:00:00Z'), [])
  assert.deepEqual(dueUnfinalizedCycles(cyclesFixture, W1, '2027-01-17T23:59:59Z'), [])
})

test('Table A: due exactly at the boundary instant (inclusive)', async () => {
  const { dueUnfinalizedCycles } = await engine
  const due = dueUnfinalizedCycles(cyclesFixture, W1, '2027-01-18T00:00:00Z')
  assert.deepEqual(due.map(c => c.id), ['c1'])
})

test('Table A: latch — finalized cycles never due, no matter how late the run', async () => {
  const { dueUnfinalizedCycles } = await engine
  const due = dueUnfinalizedCycles(cyclesFixture, W1, '2027-05-01T00:00:00Z')
  assert.deepEqual(due.map(c => c.id), ['c1', 'c2']) // c3 past due but latched
})

/*
Table B — finalization payload pins (via standings.js, the same functions the
SQL mirror is pinned against at the parity stage):
- a void posted INSIDE the cycle window nets out: s2 = +25 −5 = 20, tying
  s1 (12+8) → co-champions at 20; s3 (15) rank 3; s4's wk3 event excluded.
- D4: a zero-event cycle finalizes with ZERO champion rows (latch still
  closes — that is the SQL side's job; the engine pin is the empty payload).
*/

test('Table B: void inside the window nets out → co-champions', async () => {
  const { cycleStandings, cycleChampions } = await standings
  const events = [
    { student_id: 's1', week_number: 1, points: 12 },
    { student_id: 's1', week_number: 2, points: 8 },
    { student_id: 's2', week_number: 1, points: 25 },
    { student_id: 's2', week_number: 2, points: -5 }, // void, inside window
    { student_id: 's3', week_number: 2, points: 15 },
    { student_id: 's4', week_number: 3, points: 9 },  // outside window
  ]
  const champs = cycleChampions(cycleStandings(events, { week_start: 1, week_end: 2 }))
  assert.deepEqual(champs.map(c => c.student_id).sort(), ['s1', 's2'])
  assert.ok(champs.every(c => c.points === 20))
})

test('Table B / D4: zero-event cycle → zero champions', async () => {
  const { cycleStandings, cycleChampions } = await standings
  assert.deepEqual(cycleChampions(cycleStandings([], { week_start: 1, week_end: 2 })), [])
})

/*
Table C — snapshots. snapshotForWeek(events, W) = season ranks over events
with week_number <= W. Late-run convergence rests on the ledger property
that week_number is stamped from now() at insert: the −10 void of s1's wk1
event, posted in week 3, carries week_number 3 and can never reach back
into the W=1 or W=2 snapshots — so a job run at week 4 (after downtime)
computes the identical history a punctual job would have.

| W | cumulative totals (week_number ≤ W)    | ranks               |
|---|----------------------------------------|---------------------|
| 1 | s1 10, s2 10 (s3 absent)               | s1=1, s2=1          |
| 2 | s1 15, s2 10, s3 8                     | s1=1, s2=2, s3=3    |
| 3 | s2 30, s3 8, s1 5 (10+5−10)            | s2=1, s3=2, s1=3    |
*/

const snapshotEvents = [
  { student_id: 's1', week_number: 1, points: 10 },
  { student_id: 's2', week_number: 1, points: 10 },
  { student_id: 's1', week_number: 2, points: 5 },
  { student_id: 's3', week_number: 2, points: 8 },
  { student_id: 's2', week_number: 3, points: 20 },
  { student_id: 's1', week_number: 3, points: -10 }, // wk3-posted void of a wk1 event
]

function byStudent(rows) {
  return Object.fromEntries(rows.map(r => [r.student_id, r]))
}

test('Table C: W=1 — tie at 10, week-3 void invisible to closed weeks', async () => {
  const { snapshotForWeek } = await engine
  const snap = byStudent(snapshotForWeek(snapshotEvents, 1))
  assert.equal(snap.s1.points, 10)
  assert.equal(snap.s1.rank, 1)
  assert.equal(snap.s2.points, 10)
  assert.equal(snap.s2.rank, 1)
  assert.equal(snap.s3, undefined) // no events yet → absent, not 0
})

test('Table C: W=2 — cumulative, still untouched by the later void', async () => {
  const { snapshotForWeek } = await engine
  const snap = byStudent(snapshotForWeek(snapshotEvents, 2))
  assert.deepEqual(
    [snap.s1, snap.s2, snap.s3].map(r => [r.points, r.rank]),
    [[15, 1], [10, 2], [8, 3]]
  )
})

test('Table C: W=3 — the void lands in its posting week', async () => {
  const { snapshotForWeek } = await engine
  const snap = byStudent(snapshotForWeek(snapshotEvents, 3))
  assert.deepEqual(
    [snap.s1, snap.s2, snap.s3].map(r => [r.points, r.rank]),
    [[5, 3], [30, 1], [8, 2]]
  )
})

/*
missingSnapshotWeeks — week W is due when now >= week1_start + W weeks
(inclusive at the boundary instant), computed on raw instants so the final
week completes once the term ends (the clamped week number would sit at
weeks_total forever and never look "complete"). existingWeeks is the set of
weeks with ANY rank_snapshots rows — the week-granular first-writer-wins
guard: a partially populated week (seed) is PRESENT, never spliced into.

week1_start = 2027-01-04:
| now                   | completed weeks | existing      | missing   |
|-----------------------|-----------------|---------------|-----------|
| 2027-01-03T00:00:00Z  | none            | []            | []        |
| 2027-01-11T00:00:00Z  | 1 (boundary)    | []            | [1]       |
| 2027-01-10T23:59:59Z  | none            | []            | []        |
| 2027-02-08T00:00:00Z  | 1..5            | [1,2,4]       | [3,5]     |
| 2027-04-06T00:00:00Z  | 1..13 (term over) | [1..12]     | [13]      |
*/

test('missingSnapshotWeeks: boundary instant completes the week (inclusive)', async () => {
  const { missingSnapshotWeeks } = await engine
  assert.deepEqual(missingSnapshotWeeks(W1, WEEKS, [], '2027-01-03T00:00:00Z'), [])
  assert.deepEqual(missingSnapshotWeeks(W1, WEEKS, [], '2027-01-10T23:59:59Z'), [])
  assert.deepEqual(missingSnapshotWeeks(W1, WEEKS, [], '2027-01-11T00:00:00Z'), [1])
})

test('missingSnapshotWeeks: gaps only — existing weeks skipped whole', async () => {
  const { missingSnapshotWeeks } = await engine
  assert.deepEqual(
    missingSnapshotWeeks(W1, WEEKS, [1, 2, 4], '2027-02-08T00:00:00Z'),
    [3, 5]
  )
})

test('missingSnapshotWeeks: final week completes after term end (unclamped instants)', async () => {
  const { missingSnapshotWeeks } = await engine
  const existing = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  assert.deepEqual(missingSnapshotWeeks(W1, WEEKS, existing, '2027-04-06T00:00:00Z'), [13])
})

test('missingSnapshotWeeks: all present → empty (idempotent no-op)', async () => {
  const { missingSnapshotWeeks } = await engine
  const all = Array.from({ length: 13 }, (_, i) => i + 1)
  assert.deepEqual(missingSnapshotWeeks(W1, WEEKS, all, '2027-06-01T00:00:00Z'), [])
})

/*
Table E — team-mode unlock is compute-on-read, no job, no stored state.
Inclusive >= at the unlock-week boundary, matching teamTotals from_unlock
(week_number >= unlock counts). unlock_week 7 begins 2027-02-15T00:00:00Z.

| now                   | current week | unlocked?      |
|-----------------------|--------------|----------------|
| 2027-02-14T23:59:59Z  | 6            | no             |
| 2027-02-15T00:00:00Z  | 7            | yes            |
| 2027-05-01T00:00:00Z  | 13 (clamp)   | yes            |
| unlock_week = null    | —            | never          |
*/

test('Table E: unlock at the exact start of the unlock week', async () => {
  const { isTeamModeUnlocked } = await engine
  assert.equal(isTeamModeUnlocked(7, W1, WEEKS, '2027-02-14T23:59:59Z'), false)
  assert.equal(isTeamModeUnlocked(7, W1, WEEKS, '2027-02-15T00:00:00Z'), true)
  assert.equal(isTeamModeUnlocked(7, W1, WEEKS, '2027-05-01T00:00:00Z'), true)
})

test('Table E: null unlock week → team mode off forever', async () => {
  const { isTeamModeUnlocked } = await engine
  assert.equal(isTeamModeUnlocked(null, W1, WEEKS, '2027-05-01T00:00:00Z'), false)
})

/*
formationExpiryDue — stored timestamptz vs now, inclusive at the instant.
*/

test('formationExpiryDue: inclusive at the deadline instant, null = never', async () => {
  const { formationExpiryDue } = await engine
  const D = '2027-03-22T00:00:00Z'
  assert.equal(formationExpiryDue(D, '2027-03-21T23:59:59Z'), false)
  assert.equal(formationExpiryDue(D, '2027-03-22T00:00:00Z'), true)
  assert.equal(formationExpiryDue(null, '2027-05-01T00:00:00Z'), false)
})

/*
Table D — formation-deadline expiry planner. team_size = 3, enrolled
s01..s10 (ccid order = numeric order). Deterministic throughout: teams by
created_at ascending, students by ccid ascending — so a re-run from any
state converges. D2: filled teams keep their NAME and CAPTAIN (the plan has
no way to express changing either); disclosure of auto-fills to the incoming
student and existing members is a P9 UI obligation, recorded in the docs.
D3: never oversize — the remainder becomes an incomplete team even if it is
a single student, surfaced to the instructor.

Pre-state: T1 "Alpha" forming {s01,s02,s03} (full); T2 "Bravo" forming
{s04,s05}. Invites: i1 accepted, i2 pending, i3 declined, i4 cancelled.

| step | action                                                      |
|------|-------------------------------------------------------------|
| 1    | i2 pending → expired; i1/i3/i4 untouched                    |
| 2    | T1 at team_size → locked                                    |
| 3    | pool = {s06,s07,s08,s09,s10}                                |
| 4    | T2 + s06 (ccid order) → auto_grouped, keeps name+captain    |
| 5    | "Team 3" {s07,s08,s09} auto_grouped, captain s07;           |
|      | "Team 4" {s10} incomplete (D3) — Team N = team count + 1    |

(s06 landing on the team that once invited them is ccid-order coincidence,
not invite revival — i2 stays expired.)
*/

const enrolled10 = Array.from({ length: 10 }, (_, i) => ({
  student_id: `s${String(i + 1).padStart(2, '0')}`,
  ccid: `ccid${String(i + 1).padStart(2, '0')}`,
}))

function tableDState() {
  return {
    teamSize: 3,
    teams: [
      { id: 'T1', name: 'Alpha', status: 'forming', captain_id: 's01',
        member_ids: ['s01', 's02', 's03'], created_at: '2027-03-01T00:00:00Z' },
      { id: 'T2', name: 'Bravo', status: 'forming', captain_id: 's04',
        member_ids: ['s04', 's05'], created_at: '2027-03-02T00:00:00Z' },
    ],
    invites: [
      { id: 'i1', team_id: 'T1', status: 'accepted' },
      { id: 'i2', team_id: 'T2', status: 'pending' },
      { id: 'i3', team_id: 'T2', status: 'declined' },
      { id: 'i4', team_id: 'T2', status: 'cancelled' },
    ],
    enrolled: enrolled10,
  }
}

// Test-local mirror of what the SQL transaction does with a plan; used to
// pin the engine-level concurrency analog (post-state plans nothing).
function applyPlan(state, plan) {
  const invites = state.invites.map(i =>
    plan.expireInviteIds.includes(i.id) ? { ...i, status: 'expired' } : i)
  const statusById = new Map(plan.teamStatusChanges.map(c => [c.team_id, c.status]))
  const fillsByTeam = new Map()
  for (const f of plan.fills) {
    fillsByTeam.set(f.team_id, [...(fillsByTeam.get(f.team_id) ?? []), f.student_id])
  }
  const teams = state.teams.map(t => ({
    ...t,
    status: plan.lockTeamIds.includes(t.id) ? 'locked' : (statusById.get(t.id) ?? t.status),
    member_ids: [...t.member_ids, ...(fillsByTeam.get(t.id) ?? [])],
  }))
  plan.newTeams.forEach((nt, i) => {
    teams.push({ id: `new${i + 1}`, name: nt.name, status: nt.status,
      captain_id: nt.captain_id, member_ids: [...nt.member_ids],
      created_at: '2027-03-22T00:00:00Z' })
  })
  return { ...state, invites, teams }
}

test('Table D: invites — only pending expires', async () => {
  const { planFormationExpiry } = await engine
  const plan = planFormationExpiry(tableDState())
  assert.deepEqual(plan.expireInviteIds, ['i2'])
})

test('Table D: full forming team locks; under-sized fills from pool, keeps name+captain (D2)', async () => {
  const { planFormationExpiry } = await engine
  const plan = planFormationExpiry(tableDState())
  assert.deepEqual(plan.lockTeamIds, ['T1'])
  assert.deepEqual(plan.fills, [{ team_id: 'T2', student_id: 's06' }])
  assert.deepEqual(plan.teamStatusChanges, [{ team_id: 'T2', status: 'auto_grouped' }])
})

test('Table D: pool remainder → Team N auto_grouped chunks + incomplete tail (D3)', async () => {
  const { planFormationExpiry } = await engine
  const plan = planFormationExpiry(tableDState())
  assert.deepEqual(plan.newTeams, [
    { name: 'Team 3', captain_id: 's07', member_ids: ['s07', 's08', 's09'], status: 'auto_grouped' },
    { name: 'Team 4', captain_id: 's10', member_ids: ['s10'], status: 'incomplete' },
  ])
})

test('Table D: post-state plans nothing (engine analog of the concurrent second run)', async () => {
  const { planFormationExpiry } = await engine
  const state = tableDState()
  const after = applyPlan(state, planFormationExpiry(state))
  const replan = planFormationExpiry(after)
  assert.deepEqual(replan, {
    expireInviteIds: [], lockTeamIds: [], fills: [],
    teamStatusChanges: [], newTeams: [],
  })
})

test('Variant: full team with a still-pending invite → invite expires AND team locks', async () => {
  const { planFormationExpiry } = await engine
  const plan = planFormationExpiry({
    teamSize: 3,
    teams: [{ id: 'T1', name: 'Alpha', status: 'forming', captain_id: 's01',
      member_ids: ['s01', 's02', 's03'], created_at: '2027-03-01T00:00:00Z' }],
    invites: [{ id: 'i9', team_id: 'T1', status: 'pending' }],
    enrolled: enrolled10.slice(0, 3),
  })
  assert.deepEqual(plan.expireInviteIds, ['i9'])
  assert.deepEqual(plan.lockTeamIds, ['T1'])
  assert.deepEqual(plan.newTeams, [])
})

test('Variant: under-sized team, empty pool → incomplete, members kept, no fills', async () => {
  const { planFormationExpiry } = await engine
  const plan = planFormationExpiry({
    teamSize: 3,
    teams: [{ id: 'T1', name: 'Alpha', status: 'forming', captain_id: 's01',
      member_ids: ['s01', 's02'], created_at: '2027-03-01T00:00:00Z' }],
    invites: [],
    enrolled: enrolled10.slice(0, 2), // s01, s02 — nobody unteamed
  })
  assert.deepEqual(plan.fills, [])
  assert.deepEqual(plan.teamStatusChanges, [{ team_id: 'T1', status: 'incomplete' }])
  assert.deepEqual(plan.newTeams, [])
})

test('Variant: pool exhausted mid-fill → strangers added but still short → incomplete', async () => {
  const { planFormationExpiry } = await engine
  // team_size 4: T1 has 2, pool has only s03 → fill s03, still 3/4 → incomplete
  const plan = planFormationExpiry({
    teamSize: 4,
    teams: [{ id: 'T1', name: 'Alpha', status: 'forming', captain_id: 's01',
      member_ids: ['s01', 's02'], created_at: '2027-03-01T00:00:00Z' }],
    invites: [],
    enrolled: enrolled10.slice(0, 3),
  })
  assert.deepEqual(plan.fills, [{ team_id: 'T1', student_id: 's03' }])
  assert.deepEqual(plan.teamStatusChanges, [{ team_id: 'T1', status: 'incomplete' }])
})

test('Variant: locked / auto_grouped / incomplete teams and their members are untouched', async () => {
  const { planFormationExpiry } = await engine
  // s01–s03 locked; s04–s06 unteamed → one new team; numbering continues from
  // the section's total team count (locked team counts → "Team 2").
  const plan = planFormationExpiry({
    teamSize: 3,
    teams: [{ id: 'T0', name: 'Veterans', status: 'locked', captain_id: 's01',
      member_ids: ['s01', 's02', 's03'], created_at: '2027-02-01T00:00:00Z' }],
    invites: [],
    enrolled: enrolled10.slice(0, 6),
  })
  assert.deepEqual(plan.lockTeamIds, [])
  assert.deepEqual(plan.teamStatusChanges, [])
  assert.deepEqual(plan.fills, [])
  assert.deepEqual(plan.newTeams, [
    { name: 'Team 2', captain_id: 's04', member_ids: ['s04', 's05', 's06'], status: 'auto_grouped' },
  ])
})

test('Variant: fully resolved section → completely empty plan (idempotent no-op)', async () => {
  const { planFormationExpiry } = await engine
  const plan = planFormationExpiry({
    teamSize: 3,
    teams: [
      { id: 'T1', name: 'Alpha', status: 'locked', captain_id: 's01',
        member_ids: ['s01', 's02', 's03'], created_at: '2027-03-01T00:00:00Z' },
      { id: 'T2', name: 'Team 2', status: 'incomplete', captain_id: 's04',
        member_ids: ['s04'], created_at: '2027-03-22T00:00:00Z' },
    ],
    invites: [{ id: 'i1', team_id: 'T1', status: 'expired' }],
    enrolled: enrolled10.slice(0, 4),
  })
  assert.deepEqual(plan, {
    expireInviteIds: [], lockTeamIds: [], fills: [],
    teamStatusChanges: [], newTeams: [],
  })
})
