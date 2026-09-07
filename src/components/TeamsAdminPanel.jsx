import { useEffect, useState } from 'react'
import { listSectionTeams } from '../lib/instructorData'
import { ErrorBlock, LoadingBlock } from './DataStates'

const STATUS_COLOR = {
  forming: 'var(--warning)',
  locked: 'var(--success)',
  auto_grouped: 'var(--steel-light)',
  incomplete: 'var(--danger)',
}

// Instructor-facing team roster (P9). Read-only — team CONFIG (unlock
// week, formation deadline, size, scoring mode) still has no admin UI
// anywhere in the app; that gap predates P9 and isn't part of this
// batch's scope (see NIGHTLOG). This panel's job is the P8 D2
// obligation: surface incomplete teams so the instructor knows who
// still needs manual placement.
export default function TeamsAdminPanel({ sectionId }) {
  const [teams, setTeams] = useState(null)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setTeams(null)
    setError(null)
    listSectionTeams(sectionId)
      .then(rows => !cancelled && setTeams(rows))
      .catch(e => !cancelled && setError(e))
    return () => { cancelled = true }
  }, [sectionId, attempt])

  if (error) {
    return <ErrorBlock message="Couldn't load teams." onRetry={() => setAttempt(a => a + 1)} />
  }
  if (!teams) {
    return <LoadingBlock height={160} label="loading teams…" />
  }

  const incomplete = teams.filter(t => t.status === 'incomplete')

  if (teams.length === 0) {
    return (
      <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '20px 0' }}>
        No teams yet — teams appear here once students start forming them (or after the formation deadline
        auto-groups the section).
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {incomplete.length > 0 && (
        <div
          style={{
            background: 'rgba(201,124,124,.12)',
            border: '1px solid var(--danger)',
            borderRadius: 8,
            padding: '12px 20px',
            fontSize: 14,
            color: 'var(--text-body)',
          }}
        >
          {incomplete.length} incomplete team{incomplete.length === 1 ? '' : 's'} — short of full size after the
          formation deadline. Move members between teams manually if needed (no bulk-fix tool yet).
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {teams.map(t => (
          <div
            key={t.id}
            style={{
              background: 'var(--navy-card)',
              border: '1px solid var(--border-steel)',
              borderRadius: 8,
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>
                {t.name}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                {t.team_members.map(m => m.profiles?.full_name ?? m.student_id).join(', ')}
              </span>
            </div>
            <span
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 12,
                letterSpacing: 2,
                color: STATUS_COLOR[t.status] ?? 'var(--text-dim)',
                border: `1px solid ${STATUS_COLOR[t.status] ?? 'var(--border-steel)'}`,
                borderRadius: 999,
                padding: '3px 12px',
              }}
            >
              {t.status.toUpperCase()}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)' }}>
              {t.team_members.length} member{t.team_members.length === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
