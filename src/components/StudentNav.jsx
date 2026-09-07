import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import InitialsAvatar from './InitialsAvatar'

const BASE_TABS = [
  { to: '/', label: 'DASHBOARD', end: true },
  { to: '/leaderboard', label: 'LEADERBOARD' },
  { to: '/games', label: 'GAMES' },
  { to: '/claims', label: 'CLAIMS' },
]

// Top nav per design screens 1b–1d/2a–2b: logo, tabs with active
// underline, section pill (switcher when enrolled in multiple courses),
// avatar. TEAMS only appears once the section has team mode configured
// at all (team_unlock_week set) — matches the dashboard teaser's gate.
export default function StudentNav({ enrollments, sectionId, onSectionChange, section }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const multi = enrollments.length > 1
  const tabs = section?.team_unlock_week != null
    ? [...BASE_TABS.slice(0, 3), { to: '/teams', label: 'TEAMS' }, ...BASE_TABS.slice(3)]
    : BASE_TABS

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 28,
        padding: '0 32px',
        height: 64,
        background: 'var(--navy-nav)',
        borderBottom: '1px solid var(--border-steel)',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
        onClick={() => navigate('/')}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            color: 'var(--cream)',
            letterSpacing: 2,
          }}
        >
          FML
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 24,
          fontFamily: 'var(--font-ui)',
          fontWeight: 600,
          fontSize: 17,
          letterSpacing: 2,
          alignSelf: 'stretch',
        }}
      >
        {tabs.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              color: isActive ? 'var(--cream)' : 'var(--steel-light)',
              borderBottom: isActive ? '2px solid var(--steel)' : '2px solid transparent',
            })}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
        {multi ? (
          <select
            value={sectionId}
            onChange={e => onSectionChange(e.target.value)}
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 15,
              letterSpacing: 2,
              color: 'var(--steel-light)',
              background: 'transparent',
              border: '1px solid var(--border-steel-strong)',
              borderRadius: 'var(--radius-pill)',
              padding: '4px 14px',
              cursor: 'pointer',
            }}
          >
            {enrollments.map(e => (
              <option key={e.section_id} value={e.section_id} style={{ color: '#0F1B2E' }}>
                {e.sections.courses.code} · SECTION {e.sections.code}
              </option>
            ))}
          </select>
        ) : (
          <div
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 15,
              letterSpacing: 2,
              color: 'var(--steel-light)',
              border: '1px solid var(--border-steel-strong)',
              borderRadius: 'var(--radius-pill)',
              padding: '4px 14px',
            }}
          >
            SECTION {enrollments[0]?.sections.code}
          </div>
        )}
        <button
          onClick={signOut}
          title="Sign out"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <InitialsAvatar name={profile?.full_name} id={profile?.id} size={36} />
        </button>
      </div>
    </div>
  )
}
