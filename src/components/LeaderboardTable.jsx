import InitialsAvatar from './InitialsAvatar'
import TrendBadge from './TrendBadge'

const GRID = '70px 56px 1fr 130px 110px 90px'

function Row({ r }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        gap: 12,
        alignItems: 'center',
        padding: '10px 24px',
        background: r.isMe ? 'rgba(74, 127, 184, .18)' : 'transparent',
        borderBottom: '1px solid rgba(107,155,201,.12)',
        borderLeft: `3px solid ${r.isMe ? 'var(--steel)' : 'transparent'}`,
      }}
    >
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--steel-light)' }}>{r.rank}</span>
      <InitialsAvatar name={r.name} id={r.student_id} size={34} />
      <span
        style={{
          fontSize: 16,
          color: 'var(--cream)',
          fontWeight: r.isMe ? 700 : 400,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {r.name}
        {r.isMe && <span style={{ color: 'var(--steel-light)', fontSize: 13, marginLeft: 8 }}>YOU</span>}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-muted)' }}>
        {r.weekPts > 0 ? `+${r.weekPts}` : '—'}
      </span>
      <TrendBadge trend={r.trend} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--cream)', textAlign: 'right' }}>
        {r.points}
      </span>
    </div>
  )
}

// Full leaderboard table (screen 1c): top N rows, then — when the viewer
// is ranked below the cut — an ellipsis separator and their own row.
export default function LeaderboardTable({ topRows, youRow, youInTop }) {
  return (
    <div
      style={{
        background: 'var(--navy-card)',
        border: '1px solid var(--border-steel)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: GRID,
          gap: 12,
          padding: '12px 24px',
          fontFamily: 'var(--font-ui)',
          fontSize: 14,
          letterSpacing: 2,
          color: 'var(--text-dim)',
          borderBottom: '1px solid var(--border-steel)',
        }}
      >
        <span>RANK</span><span></span><span>STUDENT</span><span>THIS WEEK</span><span>TREND</span>
        <span style={{ textAlign: 'right' }}>POINTS</span>
      </div>
      {topRows.map(r => <Row key={r.student_id} r={r} />)}
      {!youInTop && youRow && (
        <>
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '4px 0', letterSpacing: 4 }}>⋯</div>
          <Row r={youRow} />
        </>
      )}
    </div>
  )
}
