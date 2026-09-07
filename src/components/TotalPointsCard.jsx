export default function TotalPointsCard({ totalPoints, weekPointsValue }) {
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
        gap: 4,
      }}
    >
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, letterSpacing: 3, color: 'var(--steel-light)' }}>
        TOTAL POINTS
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 56, color: 'var(--cream)', lineHeight: 1 }}>
        {totalPoints}
      </div>
      {weekPointsValue > 0 ? (
        <div style={{ fontSize: 14, color: 'var(--success)', fontWeight: 600 }}>
          +{weekPointsValue} this week
        </div>
      ) : totalPoints === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Earn your first points in lecture this week
        </div>
      ) : (
        <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>no points yet this week</div>
      )}
    </div>
  )
}
