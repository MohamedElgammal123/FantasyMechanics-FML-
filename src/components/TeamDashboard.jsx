import InitialsAvatar from './InitialsAvatar'
import { prizeProgress } from '../engine/teamFormation'

const STATUS_BADGE = {
  locked: null, // normal state, no badge needed
  auto_grouped: { label: 'AUTO-GROUPED', color: 'var(--steel-light)' },
  incomplete: { label: 'INCOMPLETE', color: 'var(--danger)' },
}

// Screen 2b — team dashboard, for locked / auto_grouped / incomplete
// teams (a 'forming' team is TeamFormation's job). autoFillNotices is a
// map student_id -> true for members placed by the deadline expiry
// rather than by accepting an invite (P8 D2 obligation, computed by the
// caller via src/engine/teamFormation.js wasAutoFilled).
export default function TeamDashboard({
  team,
  sectionCode,
  teamRank,
  totalTeams,
  teamPoints,
  weekPoints,
  members, // [{ student_id, name, points }]
  scoringMode,
  unlockWeek,
  standings, // [{ team_id, name, points, rank, isMine }]
  prizeTiers,
  autoFillNotices, // Set<student_id>
  viewerId,
}) {
  const badge = STATUS_BADGE[team.status]
  const maxMemberPoints = Math.max(1, ...members.map(m => m.points))
  const progress = prizeProgress(teamPoints, prizeTiers)
  const viewerWasAutoFilled = autoFillNotices.has(viewerId)
  const teammatesAutoFilled = members.filter(m => m.student_id !== viewerId && autoFillNotices.has(m.student_id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {viewerWasAutoFilled && (
        <Notice>
          You were added to <strong>{team.name}</strong> when the formation deadline passed — no team of your own
          was locked in time, so you were grouped in automatically.
        </Notice>
      )}
      {!viewerWasAutoFilled && teammatesAutoFilled.length > 0 && (
        <Notice>
          {teammatesAutoFilled.map(m => m.name).join(', ')} {teammatesAutoFilled.length === 1 ? 'was' : 'were'} added
          to your team at the formation deadline.
        </Notice>
      )}
      {badge && (
        <Notice tone={team.status === 'incomplete' ? 'danger' : 'default'}>
          {team.status === 'incomplete'
            ? `This team is short members — your instructor will resolve incomplete teams after the deadline.`
            : `This team was auto-grouped from unteamed classmates at the formation deadline.`}
        </Notice>
      )}

      {/* hero */}
      <div
        style={{
          background: 'linear-gradient(120deg, var(--navy-gradient), var(--navy-card))',
          border: '1px solid var(--steel)',
          borderRadius: 10,
          padding: '28px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: 28,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, letterSpacing: 3, color: 'var(--steel-light)' }}>
            SECTION {sectionCode}
            {unlockWeek != null && scoringMode === 'from_unlock' && ` · COUNTING FROM WK ${unlockWeek}`}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 48, color: 'var(--cream)', lineHeight: 1 }}>
            {team.name}
          </div>
          <div style={{ fontSize: 15, color: 'var(--text-muted)' }}>
            {members.map(m => `${m.name}${m.student_id === team.captain_id ? ' (C)' : ''}`).join(' · ')}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <StatTile label="TEAM RANK" value={teamRank ? `#${teamRank}` : '—'} sub={`of ${totalTeams} teams`} />
          <StatTile
            label="TEAM POINTS"
            value={teamPoints}
            sub={weekPoints > 0 ? `+${weekPoints} this week` : undefined}
            subColor="var(--success)"
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 20 }}>
        {/* roster */}
        <div style={panelStyle}>
          <div style={panelTitleStyle}>ROSTER &amp; CONTRIBUTIONS</div>
          {members.map(m => (
            <div key={m.student_id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <InitialsAvatar name={m.name} id={m.student_id} size={34} />
                <span style={{ fontSize: 15, color: 'var(--cream)', flex: 1 }}>
                  {m.name}
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 2, color: 'var(--steel-light)', marginLeft: 6 }}>
                    {m.student_id === team.captain_id ? 'CAPTAIN' : 'MEMBER'}
                  </span>
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--cream)' }}>{m.points}</span>
              </div>
              <div style={{ height: 8, background: 'var(--navy-panel)', borderRadius: 4, marginLeft: 46, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 4, background: 'var(--steel)', width: `${Math.round((m.points / maxMemberPoints) * 100)}%` }} />
              </div>
            </div>
          ))}
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 'auto' }}>
            Team points = sum of all members' individual FML points{scoringMode === 'from_unlock' ? ` from week ${unlockWeek} on` : ''}.
          </div>
        </div>

        {/* team leaderboard */}
        <div style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={panelTitleStyle}>TEAM LEADERBOARD · SECTION {sectionCode}</div>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, letterSpacing: 2, color: 'var(--text-dim)' }}>
              RUNS ALONGSIDE INDIVIDUAL
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
            {standings.map(row => (
              <div
                key={row.team_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '10px 14px',
                  borderRadius: 6,
                  background: row.isMine ? 'rgba(74,127,184,.22)' : 'transparent',
                  borderLeft: `3px solid ${row.isMine ? 'var(--steel)' : 'transparent'}`,
                }}
              >
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--steel-light)', width: 32 }}>{row.rank}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--cream)', flex: 1, letterSpacing: 1 }}>
                  {row.name}
                  {row.isMine && <span style={{ fontFamily: 'var(--font-ui)', color: 'var(--steel-light)', fontSize: 13, marginLeft: 8 }}>YOUR TEAM</span>}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--cream)' }}>{row.points}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* prize track */}
      {prizeTiers.length > 0 && (
        <div style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={panelTitleStyle}>TEAM PRIZE TRACK</div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--steel-light)' }}>
              {teamPoints} / {progress.tiers[progress.tiers.length - 1]?.threshold_points}
            </span>
          </div>
          <div style={{ position: 'relative', height: 14, background: 'var(--navy-panel)', borderRadius: 7 }}>
            <div
              style={{
                position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 7,
                width: `${Math.round(overallPct(teamPoints, progress.tiers) * 100)}%`,
                background: 'linear-gradient(90deg, var(--steel), var(--steel-light))',
              }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${progress.tiers.length}, 1fr)`, gap: 16 }}>
            {progress.tiers.map(t => (
              <div key={t.name} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, letterSpacing: 2, color: t.reached ? 'var(--success)' : 'var(--cream)' }}>
                  {t.reached ? '✓ ' : ''}{t.name.toUpperCase()} · {t.threshold_points}{t.reached ? ' — REACHED' : ''}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t.reward_text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Whole-bar fraction across every tier (not just the current gap) —
// tiers is threshold-ascending from prizeProgress.
function overallPct(points, tiers) {
  if (tiers.length === 0) return 0
  const max = tiers[tiers.length - 1].threshold_points
  return Math.max(0, Math.min(1, points / max))
}

function Notice({ children, tone = 'default' }) {
  return (
    <div
      style={{
        background: tone === 'danger' ? 'rgba(201,124,124,.12)' : 'rgba(74,127,184,.15)',
        border: `1px solid ${tone === 'danger' ? 'var(--danger)' : 'var(--border-steel-strong)'}`,
        borderRadius: 8,
        padding: '12px 20px',
        fontSize: 14,
        color: 'var(--text-body)',
      }}
    >
      {children}
    </div>
  )
}

function StatTile({ label, value, sub, subColor = 'var(--text-dim)' }) {
  return (
    <div style={{ background: 'var(--navy-panel)', border: '1px solid var(--border-steel-strong)', borderRadius: 10, padding: '16px 24px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, letterSpacing: 2, color: 'var(--steel-light)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 38, color: 'var(--cream)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: subColor }}>{sub}</div>}
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
  gap: 14,
}

const panelTitleStyle = {
  fontFamily: 'var(--font-ui)',
  fontWeight: 700,
  fontSize: 18,
  letterSpacing: 2,
  color: 'var(--cream)',
}
