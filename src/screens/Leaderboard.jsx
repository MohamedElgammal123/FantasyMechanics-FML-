import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStudentSection } from './StudentShell'
import { fetchRoster, fetchSectionLedger, fetchSnapshots } from '../lib/studentData'
import { maybeRunMaintenance } from '../lib/maintenance'
import { seasonRanks, weekPoints, rankTrend, leaderboardSlice } from '../engine/aggregate'
import { isTeamModeUnlocked } from '../engine/schedule'
import Podium from '../components/Podium'
import LeaderboardTable from '../components/LeaderboardTable'
import { ErrorBlock, LoadingBlock } from '../components/DataStates'

export default function Leaderboard() {
  const { profile, enrollments, sectionId, section, term, currentWeek } = useStudentSection()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    Promise.all([
      fetchSectionLedger(sectionId),
      fetchRoster(sectionId),
      fetchSnapshots(sectionId, currentWeek - 1),
    ])
      .then(([events, roster, snapshots]) => {
        if (!cancelled) setData({ events, roster, snapshots })
        // P8 lazy self-heal (no cycles fetched here — snapshot detector only).
        maybeRunMaintenance(sectionId, {
          week1Start: term.week1_start,
          currentWeek,
          events,
          prevWeekSnapshots: snapshots,
        })
      })
      .catch(e => !cancelled && setError(e))
    return () => { cancelled = true }
  }, [sectionId, currentWeek, attempt, term.week1_start])

  const derived = useMemo(() => {
    if (!data) return null
    const names = new Map(data.roster.map(r => [r.student_id, r.profiles?.full_name ?? '—']))
    const snapRank = new Map(data.snapshots.map(s => [s.student_id, s.rank]))
    const weekMap = weekPoints(data.events, currentWeek)

    const decorate = r => ({
      ...r,
      name: names.get(r.student_id) ?? '—',
      trend: rankTrend(r.rank, snapRank.get(r.student_id) ?? null),
      weekPts: weekMap.get(r.student_id) ?? 0, // absent key = 0, per engine JSDoc
      isMe: r.student_id === profile.id,
    })

    const ranks = seasonRanks(data.events)
    const slice = leaderboardSlice(ranks, profile.id, 10)
    return {
      podium: ranks.slice(0, 3).map(decorate),
      topRows: slice.top.map(decorate),
      youRow: slice.you ? decorate(slice.you) : null,
      youInTop: slice.youInTop,
      rankedCount: ranks.length,
    }
  }, [data, profile.id, currentWeek])

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <ErrorBlock message="Couldn't load the leaderboard." onRetry={() => setAttempt(a => a + 1)} />
      </div>
    )
  }
  if (!derived) {
    return (
      <div style={{ padding: '32px 120px' }}>
        <LoadingBlock height={300} label="loading standings…" />
      </div>
    )
  }

  const empty = derived.rankedCount === 0

  return (
    <div style={{ padding: '32px 120px 48px', maxWidth: 1440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 52, color: 'var(--cream)', letterSpacing: 1 }}>
          SECTION LEADERBOARD
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 16, letterSpacing: 3, color: 'var(--steel-light)' }}>
          {term.season_label} · WEEK {currentWeek} OF {term.weeks_total}
        </div>
      </div>

      {/* section pills: only the viewer's own enrollments (RLS scope) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {enrollments.map(e => (
          <span
            key={e.section_id}
            style={{
              fontFamily: 'var(--font-ui)',
              fontWeight: e.section_id === sectionId ? 700 : 400,
              fontSize: 16,
              letterSpacing: 2,
              padding: '6px 20px',
              borderRadius: 'var(--radius-pill)',
              background: e.section_id === sectionId ? 'var(--steel)' : 'transparent',
              color: e.section_id === sectionId ? 'var(--navy-panel)' : 'var(--steel-light)',
              border: e.section_id === sectionId ? '1px solid var(--steel)' : '1px solid var(--border-steel-strong)',
            }}
          >
            SECTION {e.sections.code}
          </span>
        ))}
        {section.team_unlock_week != null && (
          isTeamModeUnlocked(section.team_unlock_week, term.week1_start, term.weeks_total, new Date()) ? (
            <Link
              to="/teams"
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 16,
                letterSpacing: 2,
                padding: '6px 20px',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--border-steel-strong)',
                color: 'var(--steel-light)',
              }}
            >
              TEAMS →
            </Link>
          ) : (
            <span
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 16,
                letterSpacing: 2,
                padding: '6px 20px',
                borderRadius: 'var(--radius-pill)',
                border: '1px dashed var(--border-steel-strong)',
                color: 'var(--text-dim)',
              }}
            >
              TEAMS · UNLOCKS WK {section.team_unlock_week}
            </span>
          )
        )}
      </div>

      {empty ? (
        <div
          style={{
            background: 'var(--navy-card)',
            border: '1px solid var(--border-steel)',
            borderRadius: 'var(--radius-md)',
            padding: '48px 28px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: 'var(--text-muted)', marginBottom: 6 }}>
            THE SEASON HASN'T STARTED
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>
            The leaderboard populates after the first results upload or approved claim.
          </div>
        </div>
      ) : (
        <>
          <Podium rows={derived.podium} />
          <LeaderboardTable topRows={derived.topRows} youRow={derived.youRow} youInTop={derived.youInTop} />
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 14, color: 'var(--text-dim)' }}>
            Showing top 10 + your position · {data.roster.length} students in Section {section.code}
            {derived.youRow === null && ' · you appear once you score your first points'}
          </div>
        </>
      )}
    </div>
  )
}
