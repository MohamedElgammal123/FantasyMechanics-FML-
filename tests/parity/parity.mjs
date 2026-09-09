// P8 JS↔SQL parity gate — runs against the HOSTED dev project as the
// zseed99 viewer (the fixture sections' instructor). Requires
// tests/parity/fixture.sql to have been applied via the dashboard;
// afterwards run fixture_wipe.sql there and check the zero counts.
//
// Auth: the zseed99 session JSON (the sb-<ref>-auth-token value from
// DevTools → Local Storage while signed in as zseed99), supplied one
// of two ways:
//   1. FML_PARITY_SESSION environment variable — preferred on Windows,
//      where paste into a raw-mode prompt truncates. Set it via
//      clipboard ($env:FML_PARITY_SESSION = (Get-Clipboard -Raw)) so
//      the token never appears on a command line or in PSReadLine
//      history; the variable lives only in that shell session and
//      dies with it.
//   2. Otherwise, an stdin prompt using raw-mode input with NO echo.
// Either way the token is never echoed, never logged, and never
// written to disk (supabase client runs with persistSession: false;
// the token lives only in this process's memory).
//
// What it verifies, per the approved P8 plan:
//   1. TWO CONCURRENT run_section_maintenance calls per section both
//      succeed (advisory-lock serialization — zero errors).
//   2. A follow-up call reports all-zero work (convergence).
//   3. rank_snapshots ≡ engine snapshotForWeek for every completed
//      week, computed from the live ledger read back over RLS.
//   4. cycles ≡ engine generateCyclePlan; finalized exactly the
//      engine-due set; cycle_champions ≡ engine cycleChampions
//      (co-champion tie + in-window void + late void included).
//   5. Formation end-state ≡ planFormationExpiry applied to the
//      fixture pre-state (PRE_STATE below mirrors fixture.sql —
//      keep in sync); filled teams keep name+captain (D2), remainder
//      incomplete (D3), only pending invites expired.
//   6. Fixture B (zero events): cycles finalized with ZERO champions
//      (D4), zero snapshot rows.
//   7. The seed section EB1's cycles + champions are byte-identical
//      before and after (finalization latch).
//
// The gate does NOT require the concurrent pair to be the runs that
// did the work: if the nightly cron already swept the fixture, every
// job no-ops here and the end-state assertions still bind. Summaries
// of what each call did are printed for the record.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  generateCyclePlan, dueUnfinalizedCycles, missingSnapshotWeeks,
  snapshotForWeek, planFormationExpiry,
} from '../../src/engine/schedule.js'
import { cycleStandings, cycleChampions } from '../../src/engine/standings.js'
import { weekEndDate } from '../../src/engine/weeks.js'

// ---------- fixture constants (mirror fixture.sql) ----------
const sid = n => `5eedc0de-0000-4000-a000-0000000000${String(n).padStart(2, '0')}`
const SECT_A = '5eedc0de-0000-4000-b000-000000005ec1'
const SECT_B = '5eedc0de-0000-4000-b000-000000005ec2'
const SEED_SECTION = '5eedc0de-0000-4000-a000-000000005ec1' // EB1
const TEAM_ALPHA = '5eedc0de-0000-4000-b000-000000000701'
const TEAM_BRAVO = '5eedc0de-0000-4000-b000-000000000702'
const INV = n => `5eedc0de-0000-4000-b000-00000000080${n}`

// Formation pre-state — verbatim mirror of fixture.sql's inserts.
const PRE_STATE = {
  teamSize: 3,
  teams: [
    { id: TEAM_ALPHA, name: 'Alpha (parity)', status: 'forming', captain_id: sid(1),
      member_ids: [sid(1), sid(2), sid(3)], created_at: '1' },
    { id: TEAM_BRAVO, name: 'Bravo (parity)', status: 'forming', captain_id: sid(4),
      member_ids: [sid(4), sid(5)], created_at: '2' },
  ],
  invites: [
    { id: INV(1), team_id: TEAM_ALPHA, status: 'accepted' },
    { id: INV(2), team_id: TEAM_BRAVO, status: 'pending' },
    { id: INV(3), team_id: TEAM_BRAVO, status: 'declined' },
    { id: INV(4), team_id: TEAM_BRAVO, status: 'cancelled' },
  ],
  enrolled: Array.from({ length: 10 }, (_, i) => ({
    student_id: sid(i + 1), ccid: `zseed${String(i + 1).padStart(2, '0')}`,
  })),
}

// ---------- helpers ----------
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`)
}
const canon = rows => JSON.stringify(
  [...rows].sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))
const same = (a, b) => canon(a) === canon(b)

function env() {
  const text = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
  const get = k => text.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
  return { url: get('VITE_SUPABASE_URL'), anon: get('VITE_SUPABASE_ANON_KEY') }
}

// Raw-mode stdin prompt: nothing is echoed, nothing is logged.
function promptHidden(question) {
  return new Promise(resolve => {
    process.stdout.write(question)
    const stdin = process.stdin
    if (!stdin.isTTY) { // piped input: read it all, still never echoed by us
      let buf = ''
      stdin.on('data', c => { buf += c })
      stdin.on('end', () => resolve(buf.trim()))
      return
    }
    stdin.resume()
    stdin.setRawMode(true)
    let buf = ''
    const onData = chunk => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData)
          process.stdout.write('\n')
          resolve(buf.trim())
          return
        }
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(1) } // Ctrl-C
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1) // backspace
        else buf += ch
      }
    }
    stdin.on('data', onData)
  })
}

async function must(q, label) {
  const { data, error } = await q
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

// ---------- main ----------
const { url, anon } = env()
if (!url || !anon) { console.error('Missing .env.local values'); process.exit(1) }

console.log('P8 parity gate — hosted project, authenticated as zseed99.')
let raw = process.env.FML_PARITY_SESSION?.trim()
if (raw) {
  console.log('Using session from FML_PARITY_SESSION (value not shown).')
} else {
  raw = await promptHidden(
    'Paste the zseed99 session JSON (sb-…-auth-token from DevTools, input hidden): ')
}
let session
try {
  const parsed = JSON.parse(raw)
  session = parsed.currentSession ?? parsed
  if (!session.access_token || !session.refresh_token) throw new Error('missing tokens')
} catch (e) {
  console.error(`Could not parse session JSON (${e.message}). Nothing was logged.`)
  process.exit(1)
}

const supabase = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
})
{
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token, refresh_token: session.refresh_token,
  })
  if (error) { console.error(`setSession failed: ${error.message}`); process.exit(1) }
}
const user = (await supabase.auth.getUser()).data?.user
if (!user) { console.error('Session invalid or expired.'); process.exit(1) }
console.log(`Signed in as ${user.email} (memory-only session).\n`)

// Fixture + term config readback
const sections = await must(
  supabase.from('sections')
    .select('id, code, team_size, team_formation_deadline, terms(week1_start, weeks_total)')
    .in('id', [SECT_A, SECT_B]),
  'read fixture sections')
const sectA = sections.find(s => s.id === SECT_A)
const sectB = sections.find(s => s.id === SECT_B)
if (!sectA || !sectB) {
  console.error('Fixture sections not visible — was fixture.sql applied, and is this the zseed99 session?')
  process.exit(1)
}

// EB1 baseline (latch check) — captured before any maintenance calls
async function seedCyclesState() {
  const cycles = await must(
    supabase.from('cycles').select('id, number, week_start, week_end, finalized_at')
      .eq('section_id', SEED_SECTION).order('number'),
    'read seed cycles')
  const champs = await must(
    supabase.from('cycle_champions').select('cycle_id, student_id, points')
      .in('cycle_id', cycles.map(c => c.id)),
    'read seed champions')
  return { cycles, champs }
}
const seedBefore = await seedCyclesState()

// 1+2: concurrent maintenance per section, then convergence
const rpc = id => supabase.rpc('run_section_maintenance', { p_section: id })
for (const [label, id] of [['PA1', SECT_A], ['PB1', SECT_B]]) {
  const [r1, r2] = await Promise.all([rpc(id), rpc(id)])
  check(`${label}: two concurrent maintenance calls, zero errors`,
    !r1.error && !r2.error, r1.error?.message ?? r2.error?.message)
  console.log(`    call summaries: ${JSON.stringify(r1.data)} | ${JSON.stringify(r2.data)}`)
  // Value-wise comparison, NOT canon()/stringify: jsonb re-orders object
  // keys (length, then bytewise), so the summary comes back as
  // {snapshot_rows, cycles_created, cycles_finalized} regardless of the
  // order jsonb_build_object was called with.
  const r3 = await rpc(id)
  const s3 = r3.data ?? {}
  check(`${label}: third call converges to all-zero work`,
    !r3.error && s3.cycles_created === 0 && s3.snapshot_rows === 0 && s3.cycles_finalized === 0,
    r3.error?.message ?? JSON.stringify(r3.data))
}
console.log('')

const now = new Date()

// 3+4: ledger-derived parity for fixture A
{
  const { week1_start, weeks_total } = sectA.terms
  const events = await must(
    supabase.from('point_events').select('student_id, points, week_number')
      .eq('section_id', SECT_A),
    'read PA1 ledger')

  // snapshots
  const dbSnaps = await must(
    supabase.from('rank_snapshots').select('student_id, week_number, rank, total_points')
      .eq('section_id', SECT_A),
    'read PA1 snapshots')
  const completed = missingSnapshotWeeks(week1_start, weeks_total, [], now)
  check('PA1: snapshot weeks present = exactly the completed weeks',
    same([...new Set(dbSnaps.map(r => r.week_number))].sort(), [...completed].sort()),
    `db=[${[...new Set(dbSnaps.map(r => r.week_number))]}] expected=[${completed}]`)
  for (const w of completed) {
    const expected = snapshotForWeek(events, w)
      .map(r => ({ student_id: r.student_id, rank: r.rank, points: r.points }))
    const got = dbSnaps.filter(r => r.week_number === w)
      .map(r => ({ student_id: r.student_id, rank: r.rank, points: r.total_points }))
    check(`PA1: week-${w} snapshot ≡ engine snapshotForWeek`, same(got, expected))
  }

  // cycles + champions
  const dbCycles = await must(
    supabase.from('cycles').select('id, number, week_start, week_end, finalized_at')
      .eq('section_id', SECT_A).order('number'),
    'read PA1 cycles')
  const plan = generateCyclePlan(weeks_total)
  check('PA1: cycles ≡ engine generateCyclePlan',
    same(dbCycles.map(c => ({ number: c.number, week_start: c.week_start, week_end: c.week_end })), plan))
  const dueNumbers = new Set(
    dueUnfinalizedCycles(plan.map(p => ({ ...p, finalized_at: null })), week1_start, now)
      .map(c => c.number))
  check('PA1: finalized exactly the engine-due cycles',
    dbCycles.every(c => (c.finalized_at !== null) === dueNumbers.has(c.number)),
    dbCycles.map(c => `#${c.number}:${c.finalized_at ? 'final' : 'open'}`).join(' '))
  const dbChamps = await must(
    supabase.from('cycle_champions').select('cycle_id, student_id, points')
      .in('cycle_id', dbCycles.map(c => c.id)),
    'read PA1 champions')
  for (const c of dbCycles.filter(c => c.finalized_at !== null)) {
    const expected = cycleChampions(cycleStandings(events, c))
    const got = dbChamps.filter(r => r.cycle_id === c.id)
      .map(r => ({ student_id: r.student_id, points: r.points }))
    check(`PA1: cycle-${c.number} champions ≡ engine (ties = co-champions)`, same(got, expected))
  }
}

// 5: formation end-state ≡ planner applied to the fixture pre-state
{
  const plan = planFormationExpiry(PRE_STATE)
  const statusById = new Map(plan.teamStatusChanges.map(c => [c.team_id, c.status]))
  const fillsByTeam = new Map()
  for (const f of plan.fills) fillsByTeam.set(f.team_id, [...(fillsByTeam.get(f.team_id) ?? []), f.student_id])
  const expectedTeams = [
    ...PRE_STATE.teams.map(t => ({
      name: t.name, captain_id: t.captain_id,
      status: plan.lockTeamIds.includes(t.id) ? 'locked' : (statusById.get(t.id) ?? t.status),
      members: [...t.member_ids, ...(fillsByTeam.get(t.id) ?? [])].sort(),
    })),
    ...plan.newTeams.map(t => ({
      name: t.name, captain_id: t.captain_id, status: t.status, members: [...t.member_ids].sort(),
    })),
  ]
  const expectedInvites = PRE_STATE.invites.map(i => ({
    id: i.id, status: plan.expireInviteIds.includes(i.id) ? 'expired' : i.status,
  }))

  const dbTeams = await must(
    supabase.from('teams').select('id, name, captain_id, status, team_members(student_id)')
      .eq('section_id', SECT_A),
    'read PA1 teams')
  const gotTeams = dbTeams.map(t => ({
    name: t.name, captain_id: t.captain_id, status: t.status,
    members: t.team_members.map(m => m.student_id).sort(),
  }))
  check('PA1: teams end-state ≡ planFormationExpiry (D2 name+captain kept, D3 remainder incomplete)',
    same(gotTeams, expectedTeams),
    `got ${canon(gotTeams)}`)

  const dbInvites = await must(
    supabase.from('team_invites').select('id, status').in('id', PRE_STATE.invites.map(i => i.id)),
    'read PA1 invites')
  check('PA1: invite statuses — only pending expired',
    same(dbInvites, expectedInvites), canon(dbInvites))
}

// 6: fixture B — zero-event degenerate section (D4)
{
  const { week1_start, weeks_total } = sectB.terms
  const dbCycles = await must(
    supabase.from('cycles').select('id, number, week_start, week_end, finalized_at')
      .eq('section_id', SECT_B).order('number'),
    'read PB1 cycles')
  check('PB1: cycles ≡ engine generateCyclePlan',
    same(dbCycles.map(c => ({ number: c.number, week_start: c.week_start, week_end: c.week_end })),
         generateCyclePlan(weeks_total)))
  const allDue = dbCycles.every(c =>
    now.getTime() >= weekEndDate(week1_start, c.week_end).getTime())
  check('PB1: every cycle due and finalized (term over)',
    allDue && dbCycles.every(c => c.finalized_at !== null))
  const champs = await must(
    supabase.from('cycle_champions').select('cycle_id')
      .in('cycle_id', dbCycles.map(c => c.id)),
    'read PB1 champions')
  check('PB1: zero champion rows for zero-event cycles (D4)', champs.length === 0,
    `${champs.length} rows`)
  const snaps = await must(
    supabase.from('rank_snapshots').select('week_number').eq('section_id', SECT_B),
    'read PB1 snapshots')
  check('PB1: zero snapshot rows for an event-less ledger', snaps.length === 0,
    `${snaps.length} rows`)
}

// 7: seed section EB1 untouched (finalization latch)
{
  const seedAfter = await seedCyclesState()
  check('EB1: cycles byte-identical before/after (latch)',
    same(seedBefore.cycles, seedAfter.cycles))
  check('EB1: champions byte-identical before/after (latch)',
    same(seedBefore.champs, seedAfter.champs))
}

// ---------- verdict ----------
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} parity checks passed.`)
if (failed.length) {
  console.log('PARITY GATE: FAIL')
  process.exit(1)
}
console.log('PARITY GATE: PASS — run tests/parity/fixture_wipe.sql in the dashboard and confirm the zero counts.')
process.exit(0)
