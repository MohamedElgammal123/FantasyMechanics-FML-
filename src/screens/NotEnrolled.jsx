import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function NotEnrolled() {
  const { linkStatus, retryWithCcid, signOut, session } = useAuth()
  const [ccid, setCcid] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleRetry(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await retryWithCcid(ccid)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const wrapperStyle = {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    textAlign: 'center',
  }

  if (linkStatus === 'unlinked_recorded') {
    return (
      <div className="bg-blueprint" style={wrapperStyle}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--cream)' }}>
          We couldn't find your enrollment
        </div>
        <div style={{ color: 'var(--text-muted)', maxWidth: 420 }}>
          Your sign-in ({session?.user?.email}) has been recorded. Your instructor will need to
          link it to your section roster — check back soon, or reach out to them directly.
        </div>
        <button onClick={signOut} style={signOutButtonStyle}>Sign out</button>
      </div>
    )
  }

  return (
    <div className="bg-blueprint" style={wrapperStyle}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--cream)' }}>
        We couldn't match your account to a roster
      </div>
      <div style={{ color: 'var(--text-muted)', maxWidth: 420 }}>
        Enter your CCID and we'll try again.
      </div>
      <form onSubmit={handleRetry} style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder="CCID"
          value={ccid}
          onChange={(e) => setCcid(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-steel)',
            background: 'var(--navy-card)',
            color: 'var(--text-body)',
          }}
        />
        <button type="submit" disabled={submitting} style={signOutButtonStyle}>
          {submitting ? 'Checking…' : 'Try again'}
        </button>
      </form>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      <button onClick={signOut} style={{ ...signOutButtonStyle, marginTop: 12 }}>Sign out</button>
    </div>
  )
}

const signOutButtonStyle = {
  padding: '8px 16px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-steel)',
  background: 'transparent',
  color: 'var(--steel-light)',
  cursor: 'pointer',
}
