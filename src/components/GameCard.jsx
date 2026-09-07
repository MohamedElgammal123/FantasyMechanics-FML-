import { fmtCountdown } from '../lib/format'

const STATUS_META = {
  upcoming: { label: 'UPCOMING', color: 'var(--text-dim)' },
  open: { label: 'OPEN NOW', color: 'var(--success)' },
  closed_awaiting: { label: 'CLOSED', color: 'var(--warning)' },
  closed_scored: { label: 'CLOSED', color: 'var(--text-dim)' },
}

// One fixture card, state derived by the caller (src/engine/games.js) from
// live `now` — this component just renders whatever status it's handed.
export default function GameCard({ game, status, now, onPlay, launching }) {
  const meta = STATUS_META[status]

  return (
    <div
      style={{
        background: 'var(--navy-card)',
        border: `1px solid ${status === 'open' ? 'var(--steel)' : 'var(--border-steel)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        animation: status === 'open' ? 'fml-glow 3s ease-in-out infinite' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {status === 'open' && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--success)',
                animation: 'fml-pulse 1.6s infinite',
              }}
            />
          )}
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, letterSpacing: 3, color: meta.color }}>
            {meta.label}
          </span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>
          MD{game.matchday}
        </span>
      </div>

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--cream)', lineHeight: 1.1 }}>
        {game.title.toUpperCase()}
      </div>

      {game.blurb && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{game.blurb}</div>}

      {status === 'upcoming' && (
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          Opens{' '}
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-body)' }}>
            {new Date(game.opens_at).toLocaleString()}
          </span>
        </div>
      )}

      {status === 'open' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Closes in{' '}
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cream)' }}>
              {fmtCountdown(new Date(game.closes_at).getTime() - now)}
            </span>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
              {game.playersCount} player{game.playersCount === 1 ? '' : 's'} in
            </div>
          </div>
          <button onClick={onPlay} disabled={launching} style={playButtonStyle}>
            {launching ? 'LAUNCHING…' : 'PLAY'}
          </button>
        </div>
      )}

      {status === 'closed_awaiting' && (
        <div style={{ fontSize: 13, color: 'var(--warning)' }}>
          Awaiting close-out — results not posted yet.
        </div>
      )}

      {status === 'closed_scored' && (
        <div style={{ fontSize: 13, color: 'var(--text-body)' }}>
          {game.winners.length > 0 && (
            <div>
              Winner{game.winners.length > 1 ? 's' : ''}:{' '}
              <span style={{ color: 'var(--cream)' }}>{game.winners.join(', ')}</span>
            </div>
          )}
          <div style={{ color: 'var(--success)', marginTop: 2 }}>points awarded ✓</div>
        </div>
      )}
    </div>
  )
}

const playButtonStyle = {
  padding: '8px 20px',
  borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--steel-light)',
  background: 'var(--steel)',
  color: 'var(--cream)',
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  letterSpacing: 2,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
