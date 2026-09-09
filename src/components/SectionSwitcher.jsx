export default function SectionSwitcher({ sections, activeSectionId, onChange, onCreateNew }) {
  if (sections.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
          You don't have any sections yet.
        </div>
        <button onClick={onCreateNew} style={primaryButtonStyle}>
          + Create your first section
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <select
        value={activeSectionId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        style={selectStyle}
      >
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.courses?.code} · {s.code} · {s.terms?.name}
          </option>
        ))}
      </select>
      <button onClick={onCreateNew} style={secondaryButtonStyle}>
        + New section
      </button>
    </div>
  )
}

const selectStyle = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-steel)',
  background: 'var(--navy-card)',
  color: 'var(--text-body)',
  fontFamily: 'var(--font-ui)',
  fontSize: 16,
}

const primaryButtonStyle = {
  padding: '10px 20px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-steel-strong)',
  background: 'var(--navy-card)',
  color: 'var(--text-body)',
  fontFamily: 'var(--font-ui)',
  fontSize: 16,
  cursor: 'pointer',
}

const secondaryButtonStyle = {
  padding: '8px 16px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-steel)',
  background: 'transparent',
  color: 'var(--steel-light)',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
}
