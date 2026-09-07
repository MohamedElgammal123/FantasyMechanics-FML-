import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signInWithGoogle, signInWithMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [error, setError] = useState(null)

  async function handleMagicLink(e) {
    e.preventDefault()
    setError(null)
    try {
      await signInWithMagicLink(email)
      setMagicLinkSent(true)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div
      className="bg-blueprint"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 40,
          color: 'var(--cream)',
        }}
      >
        FANTASY MECHANICS LEAGUE
      </div>

      <button
        onClick={signInWithGoogle}
        style={{
          padding: '10px 24px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-steel-strong)',
          background: 'var(--navy-card)',
          color: 'var(--text-body)',
          fontFamily: 'var(--font-ui)',
          fontSize: 16,
          cursor: 'pointer',
        }}
      >
        Sign in with Google (@ualberta.ca)
      </button>

      <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        or
      </div>

      {magicLinkSent ? (
        <div style={{ color: 'var(--success)', fontFamily: 'var(--font-body)' }}>
          Check your inbox for a magic link.
        </div>
      ) : (
        <form onSubmit={handleMagicLink} style={{ display: 'flex', gap: 8 }}>
          <input
            type="email"
            placeholder="you@ualberta.ca"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-steel)',
              background: 'var(--navy-card)',
              color: 'var(--text-body)',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-steel)',
              background: 'transparent',
              color: 'var(--steel-light)',
              cursor: 'pointer',
            }}
          >
            Send magic link
          </button>
        </form>
      )}

      {error && (
        <div style={{ color: 'var(--danger)', fontFamily: 'var(--font-body)', fontSize: 14 }}>
          {error}
        </div>
      )}
    </div>
  )
}
