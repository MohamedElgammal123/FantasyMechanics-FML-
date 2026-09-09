const MEDALS = { 1: '#D9B96B', 2: '#B8C4D4', 3: '#C08D5A' } // gold / silver / bronze

// Top-3 podium (screen 1c). rows: first three ranked rows with names;
// ties share a rank so two rank-1 rows both get gold. Hidden by the
// caller until at least one student has points.
export default function Podium({ rows }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
      {rows.map(p => (
        <div
          key={p.student_id}
          style={{
            background: 'linear-gradient(160deg, var(--navy-gradient), var(--navy-card))',
            border: `1px solid ${p.rank === 1 ? 'rgba(217,185,107,.5)' : 'var(--border-steel)'}`,
            borderRadius: 'var(--radius-md)',
            padding: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: MEDALS[p.rank] ?? 'var(--steel)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontSize: 26,
              color: 'var(--navy-panel)',
              flex: 'none',
            }}
          >
            {p.rank}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontFamily: 'var(--font-ui)',
                fontWeight: 700,
                fontSize: 20,
                letterSpacing: 1,
                color: 'var(--cream)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {p.name}{p.isMe ? ' (YOU)' : ''}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--steel-light)' }}>
              {p.points} pts{p.note ? ` · ${p.note}` : ''}
            </span>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 18, animation: 'fml-twinkle 2.4s ease-in-out infinite', display: 'inline-block' }}>
            ★
          </span>
        </div>
      ))}
    </div>
  )
}
