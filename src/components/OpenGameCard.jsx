import { Link } from 'react-router-dom'
import { fmtCountdown } from '../lib/format'
import { useNow } from '../lib/useNow'

// Hero open-game card. game null → quiet "no game open" state (no pulse).
export default function OpenGameCard({ game }) {
  const now = useNow(1000)

  if (!game) {
    return (
      <div
        style={{
          background: 'var(--navy-card)',
          border: '1px solid var(--border-steel)',
          borderRadius: 'var(--radius-md)',
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, letterSpacing: 3, color: 'var(--text-dim)' }}>
          NO GAME OPEN
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: 'var(--text-muted)', lineHeight: 1 }}>
          NEXT FIXTURE TBA
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>
          Game windows appear here the moment they open.
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        background: 'var(--navy-card)',
        border: '1px solid var(--steel)',
        borderRadius: 'var(--radius-md)',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 6,
        animation: 'fml-glow 3s ease-in-out infinite',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--success)',
            animation: 'fml-pulse 1.6s infinite',
          }}
        />
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 15, letterSpacing: 3, color: 'var(--success)' }}>
          OPEN NOW
        </span>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 30,
          color: 'var(--cream)',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {game.title.toUpperCase()}
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
        Closes in{' '}
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cream)' }}>
          {fmtCountdown(new Date(game.closes_at).getTime() - now)}
        </span>
        {' — '}
        <Link to="/games">play now</Link>
      </div>
    </div>
  )
}
