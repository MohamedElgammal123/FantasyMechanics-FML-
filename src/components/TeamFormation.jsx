import { useMemo, useState } from 'react'
import InitialsAvatar from './InitialsAvatar'
import { fmtCountdown } from '../lib/format'
import { useNow } from '../lib/useNow'
import { seatsLeft, classifyClassmate } from '../engine/teamFormation'


// Screen 2a — form your team. Renders three variants depending on the
// viewer's state: no team yet (+ any incoming invites), captain of a
// forming team (full controls), or non-captain member of a forming team
// (read-only squad view). Locked/auto_grouped/incomplete teams are
// TeamDashboard's job, not this component's — the caller switches.
export default function TeamFormation({
  sectionCode,
  teamSize,
  deadline,
  team, // null | { id, name, captain_id, members: [{student_id,name}], invites: [...] }
  isCaptain,
  viewerId,
  incomingInvites, // [{ id, teamName, captainName, sent_at }]
  roster, // [{ student_id, name }] — full section roster, self included
  teamedStudentIds,
  busy,
  error,
  onRenameTeam,
  onSendInvite,
  onCancelInvite,
  onResendInvite,
  onDeclineInvite,
  onAcceptInvite,
  onCreateTeam,
}) {
  const now = useNow(1000)
  const [query, setQuery] = useState('')
  const [nameDraft, setNameDraft] = useState(team?.name ?? '')

  const members = team?.members ?? []
  const pendingInvites = (team?.invites ?? []).filter(i => i.status === 'pending')
  const seats = seatsLeft(members.length, pendingInvites.length, teamSize)

  const searchResults = useMemo(() => {
    if (!isCaptain || !team) return []
    const myPendingInviteeIds = pendingInvites.map(i => i.invitee_id)
    const myTeamMemberIds = members.map(m => m.student_id)
    return roster
      .filter(s => s.name.toLowerCase().includes(query.trim().toLowerCase()))
      .map(s => ({
        ...s,
        status: classifyClassmate(s.student_id, {
          viewerId,
          myTeamMemberIds,
          teamedStudentIds,
          myPendingInviteeIds,
        }),
      }))
      .filter(s => s.status !== 'you' && s.status !== 'teammate')
      .slice(0, 8)
  }, [isCaptain, team, roster, query, pendingInvites, members, viewerId, teamedStudentIds])

  const deadlineMs = deadline ? Date.parse(deadline) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, color: 'var(--cream)', letterSpacing: 1 }}>
          FORM YOUR TEAM
        </div>
        {deadlineMs != null && (
          <div
            style={{
              marginLeft: 'auto',
              background: 'var(--navy-gradient)',
              border: '1px solid var(--steel)',
              borderRadius: 8,
              padding: '8px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, letterSpacing: 2, color: 'var(--steel-light)' }}>
              FORMATION DEADLINE
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 17, color: 'var(--cream)' }}>
              {fmtCountdown(deadlineMs - now)}
            </span>
          </div>
        )}
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>
        Pick exactly {teamSize - 1} teammates from Section {sectionCode}. Your team of {teamSize} locks in once
        everyone accepts.
      </div>

      {incomingInvites.length > 0 && (
        <div
          style={{
            background: 'var(--navy-card)',
            border: '1px solid var(--border-steel-strong)',
            borderRadius: 10,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 16, letterSpacing: 2, color: 'var(--cream)' }}>
            YOUR INVITES
          </div>
          {incomingInvites.map(inv => (
            <div
              key={inv.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'var(--navy-panel)',
                borderRadius: 8,
                padding: '10px 14px',
              }}
            >
              <div style={{ flex: 1, fontSize: 14, color: 'var(--text-body)' }}>
                <strong style={{ color: 'var(--cream)' }}>{inv.teamName}</strong> invited you
                {inv.captainName ? ` — captain ${inv.captainName}` : ''}
              </div>
              <button
                disabled={busy}
                onClick={() => onAcceptInvite(inv.id)}
                style={{ ...pillButtonStyle, background: 'var(--steel)', color: 'var(--navy-panel)', border: 'none' }}
              >
                ACCEPT
              </button>
              <button
                disabled={busy}
                onClick={() => onDeclineInvite(inv.id)}
                style={{ ...pillButtonStyle, borderColor: 'var(--danger)', color: 'var(--danger)' }}
              >
                DECLINE
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: team ? '1.2fr 1fr 1fr' : '1fr 1fr', gap: 20, marginTop: 8 }}>
        {/* squad panel */}
        <div style={panelStyle}>
          {team ? (
            <>
              <div style={panelTitleStyle}>YOUR SQUAD · {teamSize} SEATS</div>
              {members.map(m => (
                <div key={m.student_id} style={rowStyle}>
                  <InitialsAvatar name={m.name} id={m.student_id} size={40} />
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ fontSize: 16, color: 'var(--cream)', fontWeight: 600 }}>{m.name}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                      {m.student_id === viewerId ? "that's you" : m.student_id === team.captain_id ? 'captain' : 'member'}
                    </span>
                  </div>
                  {m.student_id === team.captain_id && (
                    <span style={captainBadgeStyle}>CAPTAIN</span>
                  )}
                </div>
              ))}
              {pendingInvites.map(inv => (
                <div key={inv.id} style={{ ...rowStyle, border: '1px dashed var(--warning)' }}>
                  <InitialsAvatar name={inv.name} id={inv.invitee_id} size={40} />
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ fontSize: 16, color: 'var(--cream)', fontWeight: 600 }}>{inv.name}</span>
                    {isCaptain && (
                      <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                        invited &middot;{' '}
                        <a href="#" onClick={e => { e.preventDefault(); onResendInvite(inv.id) }}>resend</a>{' '}
                        &middot;{' '}
                        <a href="#" onClick={e => { e.preventDefault(); onCancelInvite(inv.id) }}>cancel</a>
                      </span>
                    )}
                  </div>
                  <span style={{ color: 'var(--warning)', border: '1px solid var(--warning)', borderRadius: 999, padding: '3px 12px', fontFamily: 'var(--font-ui)', fontSize: 13, letterSpacing: 2 }}>
                    PENDING
                  </span>
                </div>
              ))}
              {isCaptain && team.status === 'forming' && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, letterSpacing: 2, color: 'var(--steel-light)' }}>
                    TEAM NAME
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input
                      value={nameDraft}
                      onChange={e => setNameDraft(e.target.value)}
                      style={nameInputStyle}
                    />
                    <button
                      disabled={busy || nameDraft.trim() === '' || nameDraft === team.name}
                      onClick={() => onRenameTeam(nameDraft.trim())}
                      style={saveButtonStyle}
                    >
                      SAVE
                    </button>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                    Captain sets the name — teammates see it on their invite and it locks with the team.
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={panelTitleStyle}>NO TEAM YET</div>
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                Start your own squad, or wait for an invite. Either way you'll be on a team of {teamSize} by the
                formation deadline.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  placeholder="Team name"
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  style={nameInputStyle}
                />
                <button
                  disabled={busy || nameDraft.trim() === ''}
                  onClick={() => onCreateTeam(nameDraft.trim())}
                  style={saveButtonStyle}
                >
                  CREATE A TEAM
                </button>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                You become the captain — name it, then invite {teamSize - 1} classmates.
              </div>
            </>
          )}
        </div>

        {/* search / invite — captain of a still-forming team only */}
        {team && isCaptain && team.status === 'forming' && (
          <div style={panelStyle}>
            <div style={panelTitleStyle}>FIND TEAMMATES</div>
            <input
              placeholder={`Search classmates in Section ${sectionCode}…`}
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={nameInputStyle}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {searchResults.map(s => (
                <div key={s.student_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(107,155,201,.15)' }}>
                  <span style={{ flex: 1, fontSize: 15, color: 'var(--cream)' }}>{s.name}</span>
                  {s.status === 'invite' ? (
                    <button
                      disabled={busy || seats === 0}
                      onClick={() => onSendInvite(s.student_id)}
                      style={{ ...pillButtonStyle, background: 'var(--steel)', color: 'var(--navy-panel)', border: 'none' }}
                    >
                      INVITE
                    </button>
                  ) : s.status === 'invited' ? (
                    <span style={{ fontSize: 13, color: 'var(--warning)' }}>invited</span>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>already on a team</span>
                  )}
                </div>
              ))}
              {query && searchResults.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No matches.</div>
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 'auto' }}>
              {seats} seat{seats === 1 ? '' : 's'} left · invites expire at the formation deadline.
            </div>
          </div>
        )}

        {/* after the deadline — always-visible explainer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={panelStyle}>
            <div style={panelTitleStyle}>AFTER THE DEADLINE</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              Didn't lock a team of {teamSize} in time? You're auto-grouped with other unteamed classmates — you'll
              be placed, not left out.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const panelStyle = {
  background: 'var(--navy-card)',
  border: '1px solid var(--border-steel)',
  borderRadius: 10,
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const panelTitleStyle = {
  fontFamily: 'var(--font-ui)',
  fontWeight: 700,
  fontSize: 18,
  letterSpacing: 2,
  color: 'var(--cream)',
}

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  background: 'var(--navy-panel)',
  border: '1px solid var(--border-steel)',
  borderRadius: 8,
  padding: '12px 14px',
}

const captainBadgeStyle = {
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  letterSpacing: 2,
  color: 'var(--navy-panel)',
  background: 'var(--cream)',
  borderRadius: 999,
  padding: '3px 12px',
}

const nameInputStyle = {
  flex: 1,
  padding: '10px 14px',
  borderRadius: 6,
  border: '1px solid var(--border-steel-strong)',
  background: 'var(--navy-panel)',
  color: 'var(--cream)',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
}

const saveButtonStyle = {
  padding: '10px 20px',
  borderRadius: 6,
  border: '1px solid var(--border-steel-strong)',
  background: 'var(--steel)',
  color: 'var(--navy-panel)',
  fontFamily: 'var(--font-ui)',
  fontWeight: 700,
  letterSpacing: 1,
  cursor: 'pointer',
}

const pillButtonStyle = {
  padding: '6px 14px',
  borderRadius: 999,
  border: '1px solid var(--border-steel-strong)',
  background: 'transparent',
  color: 'var(--steel-light)',
  fontFamily: 'var(--font-ui)',
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: 1,
  cursor: 'pointer',
}
