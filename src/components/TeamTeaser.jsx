import { Link } from 'react-router-dom'

// Team Mode teaser (screen 1b). Rendered only when the section has a
// team_unlock_week. Locked before the unlock week; once unlocked it
// links straight into the real formation/dashboard flow (P9,
// src/screens/TeamsPage.jsx).
export default function TeamTeaser({ unlockWeek, teamSize, currentWeek }) {
  const unlocked = currentWeek >= unlockWeek
  const Wrapper = unlocked ? Link : 'div'
  const wrapperProps = unlocked ? { to: '/teams' } : {}

  return (
    <Wrapper
      {...wrapperProps}
      style={{
        border: '1px dashed var(--border-steel-strong)',
        borderRadius: 'var(--radius-md)',
        padding: '18px 28px',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        background: 'rgba(22, 38, 61, .5)',
        cursor: unlocked ? 'pointer' : 'default',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 26,
          color: 'var(--navy-panel)',
          background: 'var(--steel-light)',
          borderRadius: 8,
          padding: '6px 14px',
          lineHeight: 1,
          flex: 'none',
        }}
      >
        WK {unlockWeek}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 18, letterSpacing: 2, color: 'var(--cream)' }}>
          {unlocked ? 'TEAM MODE — UNLOCKED' : 'TEAM MODE — LOCKED'}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          {unlocked
            ? `Team formation is open — form your squad of ${teamSize} →`
            : `Unlocks Week ${unlockWeek}. Draft a squad of ${teamSize}, pick your name together, and enter the team prize track alongside the individual leaderboard.`}
        </div>
      </div>
    </Wrapper>
  )
}
