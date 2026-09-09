import { useEffect, useState } from 'react'
import { useStudentSection } from './StudentShell'
import {
  fetchAllGames,
  fetchGameLaunchCounts,
  fetchPointEventsForSources,
  fetchPostedGameResultSets,
  fetchRoster,
  launchGame,
} from '../lib/studentData'
import { gameStatus } from '../engine/games'
import { useNow } from '../lib/useNow'
import GameCard from '../components/GameCard'
import { ErrorBlock, LoadingBlock } from '../components/DataStates'

// Winner(s) per posted result set = the student(s) with max points among
// that set's point_events (derived, not read from result_rows — see
// supabase/migrations/0010_result_sets_student_read.sql).
function winnersBySetId(events, names) {
  const bySet = new Map()
  events.forEach((e) => {
    if (!bySet.has(e.source_id)) bySet.set(e.source_id, [])
    bySet.get(e.source_id).push(e)
  })
  const winners = new Map()
  bySet.forEach((rows, setId) => {
    const max = Math.max(...rows.map((r) => r.points))
    winners.set(
      setId,
      rows.filter((r) => r.points === max).map((r) => names.get(r.student_id) ?? '—')
    )
  })
  return winners
}

export default function GamesHub() {
  const { profile, sectionId } = useStudentSection()
  const [games, setGames] = useState(null)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [launchingId, setLaunchingId] = useState(null)
  const now = useNow(1000)

  useEffect(() => {
    let cancelled = false
    setGames(null)
    setError(null)

    async function load() {
      const rawGames = await fetchAllGames(sectionId)
      const gameIds = rawGames.map((g) => g.id)
      const [launchCounts, postedSets, roster] = await Promise.all([
        fetchGameLaunchCounts(gameIds),
        fetchPostedGameResultSets(sectionId, gameIds),
        fetchRoster(sectionId),
      ])
      const postedByGame = new Map(postedSets.map((rs) => [rs.game_id, rs]))
      const events = await fetchPointEventsForSources(postedSets.map((rs) => rs.id))
      const names = new Map(roster.map((r) => [r.student_id, r.profiles?.full_name ?? '—']))
      const winners = winnersBySetId(events, names)

      if (cancelled) return
      setGames(
        rawGames.map((g) => {
          const resultSet = postedByGame.get(g.id) ?? null
          return {
            ...g,
            playersCount: launchCounts.get(g.id) ?? 0,
            hasPostedResults: !!resultSet,
            winners: resultSet ? winners.get(resultSet.id) ?? [] : [],
          }
        })
      )
    }

    load().catch((e) => !cancelled && setError(e))
    return () => {
      cancelled = true
    }
  }, [sectionId, attempt])

  async function handlePlay(game) {
    setLaunchingId(game.id)
    try {
      await launchGame(profile.id, game.id)
      window.open(game.launch_url, '_blank', 'noopener,noreferrer')
      setAttempt((a) => a + 1) // refresh players_count
    } finally {
      setLaunchingId(null)
    }
  }

  return (
    <div style={{ padding: '32px 120px 48px', maxWidth: 1440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 52, color: 'var(--cream)', letterSpacing: 1 }}>
          SEASON FIXTURES
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 16, letterSpacing: 3, color: 'var(--steel-light)' }}>
          MATCHDAY SCHEDULE
        </div>
      </div>

      {error ? (
        <ErrorBlock message="Couldn't load the games hub." onRetry={() => setAttempt((a) => a + 1)} />
      ) : !games ? (
        <LoadingBlock height={200} label="loading fixtures…" />
      ) : games.length === 0 ? (
        <div
          style={{
            background: 'var(--navy-card)',
            border: '1px solid var(--border-steel)',
            borderRadius: 'var(--radius-md)',
            padding: '64px 28px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: 'var(--text-muted)', marginBottom: 6 }}>
            NO MATCHDAYS SCHEDULED YET
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>
            The fixture list appears here when your instructor schedules the first game.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {games.map((g) => (
            <GameCard
              key={g.id}
              game={g}
              status={gameStatus(g, now, g.hasPostedResults)}
              now={now}
              onPlay={() => handlePlay(g)}
              launching={launchingId === g.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
