import { Link } from 'react-router-dom'
import InitialsAvatar from './InitialsAvatar'
import TrendBadge from './TrendBadge'

// Section top-5 (screen 1b). rows: [{ student_id, rank, points, name,
// trend, isMe }] — engine-derived by the screen. Empty → season-start copy.
export default function MiniLeaderboard({ rows, sectionCode }) {
  return (
    <div
      style={{
        background: 'var(--navy-card)',
        border: '1px solid var(--border-steel)',
        borderRadius: 'var(--radius-md)',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 19, letterSpacing: 2, color: 'var(--cream)' }}>
          SECTION {sectionCode} — TOP 5
        </div>
        <Link to="/leaderboard" style={{ fontFamily: 'var(--font-ui)', fontSize: 15, letterSpacing: 1 }}>
          FULL LEADERBOARD →
        </Link>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--text-dim)', padding: '18px 0' }}>
          The season hasn't started — the leaderboard populates after the first results upload.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(r => (
            <div
              key={r.student_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: r.isMe ? 'rgba(74, 127, 184, .22)' : 'transparent',
              }}
            >
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--steel-light)', width: 32 }}>
                {r.rank}
              </span>
              <InitialsAvatar name={r.name} id={r.student_id} size={30} />
              <span
                style={{
                  fontSize: 15,
                  color: 'var(--cream)',
                  flex: 1,
                  fontWeight: r.isMe ? 700 : 400,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {r.name}{r.isMe ? ' (you)' : ''}
              </span>
              <TrendBadge trend={r.trend} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--cream)', width: 48, textAlign: 'right' }}>
                {r.points}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
