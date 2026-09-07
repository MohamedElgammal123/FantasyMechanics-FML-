// Rank trend: ▲n climbed / ▼n fell / — held or unknown.
// trend comes from engine rankTrend(): null = no snapshot (week 1) or
// unranked — render a neutral dash, never a fake ▲0.
export default function TrendBadge({ trend, suffix = '' }) {
  if (trend === null || trend === undefined) {
    return <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>—</span>
  }
  if (trend === 0) {
    // held rank — distinct from the null dash, but never "−0"
    return <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>· 0{suffix}</span>
  }
  const up = trend > 0
  return (
    <span style={{ color: up ? 'var(--success)' : 'var(--danger)', fontSize: 13, fontWeight: 600 }}>
      {up ? '▲' : '▼'} {Math.abs(trend)}{suffix}
    </span>
  )
}
