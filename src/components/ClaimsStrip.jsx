import { Link } from 'react-router-dom'
import { fmtDateShort } from '../lib/format'

const STATUS_COLOR = {
  pending: 'var(--steel-light)',
  approved: 'var(--success)',
  rejected: 'var(--danger)',
}

// Recent claims (screen 1b). Read-only in P4 — submission ships in P5,
// so there is deliberately no submit control here. claims: latest rows
// with labels attached; points shown = awarded ?? computed.
export default function ClaimsStrip({ claims, pendingCount, labelFor }) {
  return (
    <div
      style={{
        background: 'var(--navy-card)',
        border: '1px solid var(--border-steel)',
        borderRadius: 'var(--radius-md)',
        padding: '20px 28px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 19, letterSpacing: 2, color: 'var(--cream)' }}>
          RECENT CLAIMS
        </div>
        <Link to="/claims" style={{ fontFamily: 'var(--font-ui)', fontSize: 15, letterSpacing: 1, color: 'var(--steel-light)' }}>
          {pendingCount > 0 ? `${pendingCount} PENDING · ` : ''}ALL CLAIMS →
        </Link>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 10 }}>
        WuClap quiz &amp; game points post automatically when your instructor uploads results — claims
        are only for in-class activities.
      </div>
      {claims.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--text-dim)', padding: '10px 0', borderTop: '1px solid rgba(107,155,201,.15)' }}>
          No claims yet — raise your hand in lecture.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {claims.map(c => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '10px 0',
                borderTop: '1px solid rgba(107,155,201,.15)',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)', width: 70, flex: 'none' }}>
                {fmtDateShort(c.lecture_date)}
              </span>
              <span
                style={{
                  fontSize: 15,
                  color: 'var(--text-body)',
                  flex: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <span style={{ color: 'var(--steel-light)' }}>{labelFor(c.activity_type_id)}</span>
                {' — '}{c.description}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--cream)' }}>
                +{c.awarded_points ?? c.computed_points}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  letterSpacing: 2,
                  padding: '3px 12px',
                  borderRadius: 'var(--radius-pill)',
                  color: STATUS_COLOR[c.status],
                  border: `1px solid ${STATUS_COLOR[c.status]}`,
                }}
              >
                {c.status.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
