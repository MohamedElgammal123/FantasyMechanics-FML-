import TrendBadge from './TrendBadge'

// Hero rank card (screen 1b): big #N roundel, name, trend + section size.
// rank null = no points yet (empty state).
export default function RankCard({ rank, trend, fullName, sectionCode, rosterCount }) {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, var(--navy-gradient), var(--navy-card))',
        border: '1px solid var(--border-steel-strong)',
        borderRadius: 'var(--radius-md)',
        padding: '24px 28px',
        display: 'flex',
        alignItems: 'center',
        gap: 28,
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          border: '3px solid var(--steel)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--navy-panel)',
          flex: 'none',
        }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 42, color: 'var(--cream)', lineHeight: 1 }}>
          {rank ? `#${rank}` : '#—'}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, letterSpacing: 3, color: 'var(--steel-light)' }}>
          YOUR RANK · SECTION {sectionCode}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 40,
            color: 'var(--cream)',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {fullName?.toUpperCase()}
        </div>
        <div style={{ fontSize: 15 }}>
          {rank ? (
            <>
              <TrendBadge trend={trend} suffix={trend ? ' places this week' : ''} />
              <span style={{ color: 'var(--text-muted)' }}> · {rosterCount} students in section</span>
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>
              No points yet — your rank appears after your first activity
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
