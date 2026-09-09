// Shared loading / error blocks so no widget ever renders a white flash,
// a crash, or a silent blank.

export function LoadingBlock({ label = 'loading…', height = 120 }) {
  return (
    <div
      style={{
        minHeight: height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-dim)',
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        background: 'var(--navy-card)',
        border: '1px solid var(--border-steel)',
        borderRadius: 'var(--radius-md)',
        animation: 'fml-pulse 1.6s infinite',
      }}
    >
      {label}
    </div>
  )
}

export function ErrorBlock({ message, onRetry }) {
  return (
    <div
      style={{
        padding: '20px 28px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: 'var(--navy-card)',
        border: '1px solid var(--danger)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <span style={{ color: 'var(--danger)', fontSize: 14, flex: 1 }}>
        {message ?? 'Something went wrong loading this data.'}
      </span>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: '6px 16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-steel-strong)',
            background: 'transparent',
            color: 'var(--steel-light)',
            fontFamily: 'var(--font-ui)',
            letterSpacing: 2,
            cursor: 'pointer',
          }}
        >
          RETRY
        </button>
      )}
    </div>
  )
}
