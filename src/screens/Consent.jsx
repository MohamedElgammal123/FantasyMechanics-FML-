import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

// Consent at first sign-in (0013). Shown after auth succeeds, BEFORE
// link_user_on_first_login ever runs, and only for sessions with no
// profiles row yet — returning users never see this screen (the
// AuthContext gate routes them straight to linking).
export default function Consent() {
  const { session, agreeToConsent, declineConsent } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleAgree() {
    setBusy(true)
    setError(null)
    try {
      await agreeToConsent()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function handleDecline() {
    setBusy(true)
    try {
      await declineConsent()
    } finally {
      setBusy(false)
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
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 560,
          background: 'var(--navy-card)',
          border: '1px solid var(--border-steel)',
          borderRadius: 12,
          padding: '32px 36px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, color: 'var(--cream)', letterSpacing: 1 }}>
          Joining the Fantasy Mechanics League
        </div>
        {session?.user?.email && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)' }}>
            signing in as {session.user.email}
          </div>
        )}

        <div style={sectionBodyStyle}>
          To run the competition, FML stores your name, CCID, and university email, plus the
          participation points you earn in class activities and games.
        </div>

        <div>
          <div style={sectionTitleStyle}>WHO CAN SEE WHAT</div>
          <div style={sectionBodyStyle}>
            Your name and points appear on your section's leaderboard, visible to classmates in
            your section; full records are visible only to your instructor. Nothing is shared
            outside the course, and your data is never sold or used for advertising.
          </div>
        </div>

        <div>
          <div style={sectionTitleStyle}>VOLUNTARY</div>
          <div style={sectionBodyStyle}>
            FML is optional and has no effect on your course grade. You can stop participating at
            any time, and you may ask your instructor to remove your data.
          </div>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6 }}>
          <button onClick={handleAgree} disabled={busy} style={agreeButtonStyle}>
            {busy ? 'Joining…' : 'I agree — join the league'}
          </button>
          <button onClick={handleDecline} disabled={busy} style={declineButtonStyle}>
            No thanks
          </button>
        </div>
      </div>
    </div>
  )
}

const sectionTitleStyle = {
  fontFamily: 'var(--font-ui)',
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: 2,
  color: 'var(--steel-light)',
  marginBottom: 4,
}

const sectionBodyStyle = {
  fontSize: 14.5,
  lineHeight: 1.55,
  color: 'var(--text-body)',
}

const agreeButtonStyle = {
  padding: '10px 22px',
  borderRadius: 6,
  border: 'none',
  background: 'var(--steel)',
  color: 'var(--navy-panel)',
  fontFamily: 'var(--font-ui)',
  fontWeight: 700,
  letterSpacing: 1,
  cursor: 'pointer',
}

const declineButtonStyle = {
  padding: '10px 18px',
  borderRadius: 6,
  border: '1px solid var(--border-steel)',
  background: 'transparent',
  color: 'var(--steel-light)',
  fontFamily: 'var(--font-ui)',
  cursor: 'pointer',
}
