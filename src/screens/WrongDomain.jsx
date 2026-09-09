import { useAuth } from '../context/AuthContext'

export default function WrongDomain() {
  const { session, signOut } = useAuth()

  return (
    <div
      className="bg-blueprint"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--cream)' }}>
        Please use your @ualberta.ca account
      </div>
      <div style={{ color: 'var(--text-muted)' }}>
        You signed in with {session?.user?.email}, which isn't a ualberta.ca address.
      </div>
      <button
        onClick={signOut}
        style={{
          padding: '8px 16px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-steel)',
          background: 'transparent',
          color: 'var(--steel-light)',
          cursor: 'pointer',
        }}
      >
        Try a different account
      </button>
    </div>
  )
}
