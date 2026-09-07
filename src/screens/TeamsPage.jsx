import { useEffect, useMemo, useState } from 'react'
import { useStudentSection } from './StudentShell'
import {
  fetchSectionTeams,
  fetchTeamInvitesForTeams,
  fetchPrizeTiers,
  fetchRoster,
  fetchSectionLedger,
  renameTeam,
  sendTeamInvite,
  cancelTeamInvite,
  resendTeamInvite,
  declineTeamInvite,
  acceptTeamInvite,
  createTeam,
} from '../lib/studentData'
import { maybeRunTeamMaintenance } from '../lib/maintenance'
import { isTeamModeUnlocked } from '../engine/schedule'
import { teamTotals, teamStandings } from '../engine/teams'
import { seasonRanks } from '../engine/aggregate'
import { wasAutoFilled } from '../engine/teamFormation'
import TeamTeaser from '../components/TeamTeaser'
import TeamFormation from '../components/TeamFormation'
import TeamDashboard from '../components/TeamDashboard'
import { ErrorBlock, LoadingBlock } from '../components/DataStates'

export default function TeamsPage() {
  const { profile, section, term, sectionId, currentWeek } = useStudentSection()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  const unlocked = isTeamModeUnlocked(section.team_unlock_week, term.week1_start, term.weeks_total, new Date())

  useEffect(() => {
    if (!unlocked) return
    let cancelled = false
    setData(null)
    setError(null)
    setActionError(null)
    ;(async () => {
      try {
        const teams = await fetchSectionTeams(sectionId)
        const [invites, prizeTiers, roster, events] = await Promise.all([
          fetchTeamInvitesForTeams(teams.map(t => t.id)),
          fetchPrizeTiers(sectionId),
          fetchRoster(sectionId),
          fetchSectionLedger(sectionId),
        ])
        if (cancelled) return
        setData({ teams, invites, prizeTiers, roster, events })
        maybeRunTeamMaintenance(sectionId, {
          deadline: section.team_formation_deadline,
          teams,
          invites,
        })
      } catch (e) {
        if (!cancelled) setError(e)
      }
    })()
    return () => { cancelled = true }
  }, [unlocked, sectionId, attempt, section.team_formation_deadline])

  const derived = useMemo(() => {
    if (!data) return null
    const nameOf = new Map(data.roster.map(r => [r.student_id, r.profiles?.full_name ?? '—']))
    const teamedStudentIds = data.teams.flatMap(t => t.team_members.map(m => m.student_id))

    const myTeam = data.teams.find(t => t.team_members.some(m => m.student_id === profile.id)) ?? null

    const myInvites = data.invites.filter(i => i.invitee_id === profile.id && i.status === 'pending' && i.team_id !== myTeam?.id)
    const incomingInvites = myInvites.map(i => {
      const t = data.teams.find(x => x.id === i.team_id)
      return {
        id: i.id,
        teamName: t?.name ?? '—',
        captainName: t ? nameOf.get(t.captain_id) : null,
        sent_at: i.sent_at,
      }
    })

    const roster = data.roster.map(r => ({ student_id: r.student_id, name: nameOf.get(r.student_id) ?? '—' }))

    let formationTeam = null
    if (myTeam) {
      formationTeam = {
        id: myTeam.id,
        name: myTeam.name,
        captain_id: myTeam.captain_id,
        status: myTeam.status,
        members: myTeam.team_members.map(m => ({
          student_id: m.student_id,
          name: nameOf.get(m.student_id) ?? '—',
          joined_at: m.joined_at,
        })),
        invites: data.invites
          .filter(i => i.team_id === myTeam.id)
          .map(i => ({ ...i, name: nameOf.get(i.invitee_id) ?? '—' })),
      }
    }

    const ranks = seasonRanks(data.events)
    const pointsById = new Map(ranks.map(r => [r.student_id, r.points]))

    let dashboard = null
    if (myTeam && myTeam.status !== 'forming') {
      const teamsForEngine = data.teams.map(t => ({ id: t.id, member_ids: t.team_members.map(m => m.student_id) }))
      const standingsRaw = teamStandings(data.events, teamsForEngine, section.team_scoring_mode, section.team_unlock_week)
      const teamName = new Map(data.teams.map(t => [t.id, t.name]))
      const standings = standingsRaw.map(s => ({
        team_id: s.team_id,
        name: teamName.get(s.team_id) ?? '—',
        points: s.points,
        rank: s.rank,
        isMine: s.team_id === myTeam.id,
      }))
      const myStanding = standings.find(s => s.isMine)

      const thisWeekEvents = data.events.filter(e => e.week_number === currentWeek)
      const memberIds = myTeam.team_members.map(m => m.student_id)
      const weekPoints = teamTotals(thisWeekEvents, memberIds, 'full_season', 0)

      const autoFillNotices = new Set(
        myTeam.team_members
          .filter(m => wasAutoFilled(m.joined_at, section.team_formation_deadline))
          .map(m => m.student_id)
      )

      dashboard = {
        team: myTeam,
        teamRank: myStanding?.rank ?? null,
        totalTeams: standings.length,
        teamPoints: myStanding?.points ?? 0,
        weekPoints,
        members: myTeam.team_members.map(m => ({
          student_id: m.student_id,
          name: nameOf.get(m.student_id) ?? '—',
          points: pointsById.get(m.student_id) ?? 0,
        })),
        standings,
        autoFillNotices,
      }
    }

    return { myTeam, formationTeam, incomingInvites, roster, teamedStudentIds, dashboard }
  }, [data, profile.id, currentWeek, section.team_scoring_mode, section.team_unlock_week, section.team_formation_deadline])

  async function runAction(fn) {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
      setAttempt(a => a + 1)
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!unlocked) {
    return (
      <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
        <TeamTeaser
          unlockWeek={section.team_unlock_week}
          teamSize={section.team_size}
          currentWeek={currentWeek}
        />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <ErrorBlock message="Couldn't load team mode." onRetry={() => setAttempt(a => a + 1)} />
      </div>
    )
  }
  if (!data || !derived) {
    return (
      <div style={{ padding: 32 }}>
        <LoadingBlock height={280} label="loading your team…" />
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 64px 48px', maxWidth: 1440, margin: '0 auto' }}>
      {derived.dashboard ? (
        <TeamDashboard
          {...derived.dashboard}
          sectionCode={section.code}
          scoringMode={section.team_scoring_mode}
          unlockWeek={section.team_unlock_week}
          viewerId={profile.id}
          prizeTiers={data.prizeTiers}
        />
      ) : (
        <TeamFormation
          sectionCode={section.code}
          teamSize={section.team_size}
          deadline={section.team_formation_deadline}
          team={derived.formationTeam}
          isCaptain={derived.formationTeam?.captain_id === profile.id}
          viewerId={profile.id}
          incomingInvites={derived.incomingInvites}
          roster={derived.roster}
          teamedStudentIds={derived.teamedStudentIds}
          busy={busy}
          error={actionError}
          onRenameTeam={name => runAction(() => renameTeam(derived.formationTeam.id, name))}
          onSendInvite={studentId => runAction(() => sendTeamInvite(derived.formationTeam.id, studentId))}
          onCancelInvite={inviteId => runAction(() => cancelTeamInvite(inviteId))}
          onResendInvite={inviteId => runAction(() => resendTeamInvite(inviteId))}
          onDeclineInvite={inviteId => runAction(() => declineTeamInvite(inviteId))}
          onAcceptInvite={inviteId => runAction(() => acceptTeamInvite(inviteId))}
          onCreateTeam={name => runAction(() => createTeam(sectionId, name))}
        />
      )}
    </div>
  )
}
