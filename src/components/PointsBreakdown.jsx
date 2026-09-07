// Points breakdown split Individual vs Large-Scale (the paper's taxonomy).
// rows: engine activityBreakdown() output joined with labels —
// [{ id, category, points, label }] zero-filled, clamped ≥ 0.
// Empty account: all zeros render with an explainer (shows the paths to
// points — motivational even before the first event).
export default function PointsBreakdown({ rows }) {
  const max = Math.max(1, ...rows.map(r => r.points))
  const allZero = rows.every(r => r.points === 0)
  const cols = [
    { title: 'INDIVIDUAL ENGAGEMENT', items: rows.filter(r => r.category === 'individual'), color: 'var(--steel-light)' },
    { title: 'LARGE-SCALE INTERACTIVE', items: rows.filter(r => r.category === 'large_scale'), color: 'var(--steel)' },
  ]

  return (
    <div
      style={{
        background: 'var(--navy-card)',
        border: '1px solid var(--border-steel)',
        borderRadius: 'var(--radius-md)',
        padding: '24px 28px',
      }}
    >
      <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 19, letterSpacing: 2, color: 'var(--cream)', marginBottom: allZero ? 6 : 18 }}>
        POINTS BREAKDOWN
      </div>
      {allZero && (
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>
          Two paths to points: claim in-class activities, or rank in WuClap quizzes and games.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        {cols.map(col => (
          <div key={col.title} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 14,
                letterSpacing: 2,
                color: 'var(--steel-light)',
                borderBottom: '1px solid var(--border-steel)',
                paddingBottom: 6,
              }}
            >
              {col.title}
            </div>
            {col.items.map((act, i) => (
              <div key={act.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-body)' }}>{act.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cream)' }}>{act.points}</span>
                </div>
                <div style={{ height: 8, background: 'var(--navy-panel)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 4,
                      background: col.color,
                      width: `${(act.points / max) * 100}%`,
                      transformOrigin: 'left',
                      animation: `fml-grow .9s ${i * 0.08}s cubic-bezier(.2,.7,.3,1) both`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
