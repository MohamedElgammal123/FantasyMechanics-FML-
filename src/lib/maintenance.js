import { supabase } from './supabaseClient'
import { dueUnfinalizedCycles, formationExpiryDue } from '../engine/schedule'

// P8 lazy self-heal — the fallback leg of the scheduling design (the
// timer leg is pg_cron, supabase/migrations/0011_scheduling.sql). When
// data a screen ALREADY fetched shows overdue scheduled work, fire the
// server's idempotent catch-up once, fire-and-forget. The server
// revalidates everything under advisory locks; this is only a trigger,
// never a computation, and a stray extra call is a cheap no-op.
//
// Detectors (both from in-hand data — no extra reads):
//   · a cycle past its end boundary with finalized_at still null
//   · an empty previous-week snapshot when the ledger proves it should
//     have rows (some event exists in a completed week) — the exact
//     condition under which trend arrows are wrongly blank
//
// No await, no reload: the current render honestly shows the stale
// state it fetched; the healed state appears on the next load.
export function maybeRunMaintenance(sectionId, {
  week1Start, currentWeek, events, prevWeekSnapshots, cycles = [],   now = new Date(),
}) {
  const cyclesDue = dueUnfinalizedCycles(cycles, week1Start, now).length > 0
  const snapshotMissing =
    currentWeek > 1 &&
    prevWeekSnapshots.length === 0 &&
    events.some(e => e.week_number <= currentWeek - 1)
  if (!cyclesDue && !snapshotMissing) return
  supabase.rpc('run_section_maintenance', { p_section: sectionId })
    .then(({ error }) => {
      if (error) console.warn('maintenance self-heal failed (cron will retry):', error.message)
    })
}

// P9 companion detector: same self-heal, fired from the Teams page when
// the fetched data shows the formation deadline has passed but
// expire_team_formation clearly hasn't run yet (a forming team or a
// pending invite still on the books). run_section_maintenance is
// idempotent and safe to call speculatively — see 0011_scheduling.sql.
export function maybeRunTeamMaintenance(sectionId, { deadline, teams = [], invites = [], now = new Date() }) {
  if (!formationExpiryDue(deadline, now)) return
  const pendingWork =
    teams.some(t => t.status === 'forming') || invites.some(i => i.status === 'pending')
  if (!pendingWork) return
  supabase.rpc('run_section_maintenance', { p_section: sectionId })
    .then(({ error }) => {
      if (error) console.warn('team formation self-heal failed (cron will retry):', error.message)
    })
}
