import { useEffect, useMemo, useState } from 'react'
import { useStudentSection } from './StudentShell'
import {
  fetchActivityTypes,
  fetchCycles,
  fetchMyClaims,
  fetchMyPendingClaimCount,
  fetchOpenGames,
  fetchRoster,
  fetchSectionLedger,
  fetchSnapshots,
} from '../lib/studentData'
import { maybeRunMaintenance } from '../lib/maintenance'
import { seasonRanks, weekPoints, activityBreakdown, rankTrend, cycleForWeek } from '../engine/aggregate'
import { cycleStandings } from '../engine/standings'
import { weekEndDate } from '../engine/weeks'
import RankCard from '../components/RankCard'
import TotalPointsCard from '../components/TotalPointsCard'
import OpenGameCard from '../components/OpenGameCard'
import ChampionsStrip from '../components/ChampionsStrip'
import TeamTeaser from '../components/TeamTeaser'
import PointsBreakdown from '../components/PointsBreakdown'
import MiniLeaderboard from '../components/MiniLeaderboard'
import ClaimsStrip from '../components/ClaimsStrip'
import { ErrorBlock, LoadingBlock } from '../components/DataStates'

// Fixed display order for the breakdown (matches the paper's taxonomy).
const ACTIVITY_ORDER = ['discussion', 'correct_mistakes', 'act_as_professor', 'demo', 'wuclap', 'game']

export default function StudentDashboard() {
  const { profile, sectionId, section, term, currentWeek } = useStudentSection()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    Promise.all([
      fetchSectionLedger(sectionId),
      fetchActivityTypes(),
      fetchSnapshots(sectionId, currentWeek - 1),
      fetchCycles(sectionId),
      fetchMyClaims(sectionId, profile.id, 5),
      fetchMyPendingClaimCount(sectionId, profile.id),
      fetchRoster(sectionId),
      fetchOpenGames(sectionId),
    ])
      .then(([events, activityTypes, snapshots, cycles, claims, pendingCount, roster, openGames]) => {
        if (!cancelled) setData({ events, activityTypes, snapshots, cycles, claims, pendingCount, roster, openGames })
        // P8 lazy self-heal: fire-and-forget when fetched data shows overdue
        // scheduled work (unfinalized past-due cycle / missing snapshot).
        maybeRunMaintenance(sectionId, {
          week1Start: term.week1_start,
          currentWeek,
          events,
          prevWeekSnapshots: snapshots,
          cycles,
        })
      })
      .catch(e => !cancelled && setError(e))
    return () => { cancelled = true }
  }, [sectionId, profile.id, currentWeek, attempt, term.week1_start])

  const derived = useMemo(() => {
    if (!data) return null
    const { events, activityTypes, snapshots, cycles } = data

    const ranks = seasonRanks(events)
    const me = ranks.find(r => r.student_id === profile.id) ?? null
    const snapRank = new Map(snapshots.map(s => [s.student_id, s.rank]))
    const weekMap = weekPoints(events, currentWeek)

    const orderedTypes = [...activityTypes].sort(
      (a, b) => ACTIVITY_ORDER.indexOf(a.id) - ACTIVITY_ORDER.indexOf(b.id)
    )
    const labelMap = new Map(activityTypes.map(a => [a.id, a.label]))
    const myEvents = events.filter(e => e.student_id === profile.id)
    const breakdown = activityBreakdown(myEvents, orderedTypes).map(row => ({
      ...row,
      label: labelMap.get(row.id) ?? row.id,
    }))

    const currentCycle = cycleForWeek(cycles, currentWeek)
    let myCycleRank = null
    if (currentCycle) {
      const standings = cycleStandings(events, currentCycle)
      myCycleRank = standings.find(s => s.student_id === profile.id)?.rank ?? null
    }

    const names = new Map(data.roster.map(r => [r.student_id, r.profiles?.full_name ?? '—']))
    const top5 = ranks.slice(0, 5).map(r => ({
      ...r,
      name: names.get(r.student_id) ?? '—',
      trend: rankTrend(r.rank, snapRank.get(r.student_id) ?? null),
      isMe: r.student_id === profile.id,
    }))

    return {
      me,
      myTrend: rankTrend(me?.rank ?? null, snapRank.get(profile.id) ?? null),
      myTotal: me?.points ?? 0,
      myWeekPoints: weekMap.get(profile.id) ?? 0, // absent key = 0, per engine JSDoc
      breakdown,
      labelMap,
      currentCycle,
      currentCycleEndsAt: currentCycle
        ? weekEndDate(term.week1_start, currentCycle.week_end).getTime()
        : null,
      myCycleRank,
      top5,
    }
  }, [data, profile.id, currentWeek, term.week1_start])

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <ErrorBlock message="Couldn't load your dashboard." onRetry={() => setAttempt(a => a + 1)} />
      </div>
    )
  }
  if (!data || !derived) {
    return (
      <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <LoadingBlock height={148} label="loading your season…" />
        <LoadingBlock height={120} label=" " />
        <LoadingBlock height={220} label=" " />
      </div>
    )
  }

  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1440, margin: '0 auto' }}>
      {/* hero row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 20 }}>
        <RankCard
          rank={derived.me?.rank ?? null}
          trend={derived.myTrend}
          fullName={profile.full_name}
          sectionCode={section.code}
          rosterCount={data.roster.length}
        />
        <TotalPointsCard totalPoints={derived.myTotal} weekPointsValue={derived.myWeekPoints} />
        <OpenGameCard game={data.openGames[0] ?? null} />
      </div>

      {/* bi-weekly champions (hidden only if the section has no cycles at all) */}
      {data.cycles.length > 0 && (
        <ChampionsStrip
          cycles={data.cycles}
          sectionCode={section.code}
          currentCycleNumber={derived.currentCycle?.number ?? null}
          currentCycleEndsAt={derived.currentCycleEndsAt}
          myCycleRank={derived.myCycleRank}
        />
      )}

      {/* team mode teaser — hidden when team mode is off */}
      {section.team_unlock_week != null && (
        <TeamTeaser
          unlockWeek={section.team_unlock_week}
          teamSize={section.team_size}
          currentWeek={currentWeek}
        />
      )}

      {/* middle row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
        <PointsBreakdown rows={derived.breakdown} />
        <MiniLeaderboard rows={derived.top5} sectionCode={section.code} />
      </div>

      <ClaimsStrip
        claims={data.claims}
        pendingCount={data.pendingCount}
        labelFor={id => derived.labelMap.get(id) ?? id}
      />
    </div>
  )
}
