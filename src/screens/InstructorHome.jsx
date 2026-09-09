import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchPendingClaims, listCourses, listGames, listMySections, listTerms } from '../lib/instructorData'
import SectionSwitcher from '../components/SectionSwitcher'
import CreateSectionForm from '../components/CreateSectionForm'
import EnrollmentsPanel from '../components/EnrollmentsPanel'
import ClaimsApprovalQueue from '../components/ClaimsApprovalQueue'
import GrantPointsForm from '../components/GrantPointsForm'
import PayoutCurveManager from '../components/PayoutCurveManager'
import ResultSetHistory from '../components/ResultSetHistory'
import ResultUploadPanel from '../components/ResultUploadPanel'
import GamesManagerPanel from '../components/GamesManagerPanel'
import GradebookUploadPanel from '../components/GradebookUploadPanel'
import GradebookUploadHistory from '../components/GradebookUploadHistory'
import AnalyticsDashboard from '../components/AnalyticsDashboard'
import TeamsAdminPanel from '../components/TeamsAdminPanel'

function lastSectionKey(instructorId) {
  return `fml:lastSectionId:${instructorId}`
}

export default function InstructorHome() {
  const { profile, signOut } = useAuth()

  const [courses, setCourses] = useState([])
  const [terms, setTerms] = useState([])
  const [sections, setSections] = useState([])
  const [activeSectionId, setActiveSectionId] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('enrollments')
  const [pendingCount, setPendingCount] = useState(0)
  const [resultsRefreshKey, setResultsRefreshKey] = useState(0)
  const [gamesResultsRefreshKey, setGamesResultsRefreshKey] = useState(0)
  const [games, setGames] = useState([])
  const [gamesRefreshKey, setGamesRefreshKey] = useState(0)
  const [gradebookRefreshKey, setGradebookRefreshKey] = useState(0)

  const refetchSections = useCallback(async () => {
    const mySections = await listMySections(profile.id)
    setSections(mySections)
    return mySections
  }, [profile.id])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [allCourses, allTerms, mySections] = await Promise.all([
          listCourses(),
          listTerms(),
          listMySections(profile.id),
        ])
        if (cancelled) return
        setCourses(allCourses)
        setTerms(allTerms)
        setSections(mySections)

        const savedId = window.localStorage.getItem(lastSectionKey(profile.id))
        const restored = mySections.find((s) => s.id === savedId)
        setActiveSectionId(restored?.id ?? mySections[0]?.id ?? null)
        setShowCreateForm(mySections.length === 0)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [profile.id])

  function handleSectionChange(sectionId) {
    setActiveSectionId(sectionId)
    window.localStorage.setItem(lastSectionKey(profile.id), sectionId)
  }

  useEffect(() => {
    if (!activeSectionId) return
    let cancelled = false
    fetchPendingClaims(activeSectionId).then(claims => !cancelled && setPendingCount(claims.length))
    return () => { cancelled = true }
  }, [activeSectionId, tab])

  // Feeds the game picker in the GAMES-tab upload panel — kept fresh
  // whenever GamesManagerPanel creates/edits a game (onChanged below).
  useEffect(() => {
    if (!activeSectionId) return
    let cancelled = false
    listGames(activeSectionId).then(g => !cancelled && setGames(g))
    return () => { cancelled = true }
  }, [activeSectionId, gamesRefreshKey])

  async function handleSectionCreated(section) {
    await refetchSections()
    // pick up any newly-created course/term for future "+ new section" forms
    const [allCourses, allTerms] = await Promise.all([listCourses(), listTerms()])
    setCourses(allCourses)
    setTerms(allTerms)
    setShowCreateForm(false)
    handleSectionChange(section.id)
  }

  return (
    <div
      className="bg-blueprint"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        padding: '48px 24px',
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, color: 'var(--cream)' }}>
        Welcome, {profile?.full_name}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>loading…</div>
      ) : error ? (
        <div style={{ color: 'var(--danger)' }}>{error}</div>
      ) : (
        <>
          <SectionSwitcher
            sections={sections}
            activeSectionId={activeSectionId}
            onChange={handleSectionChange}
            onCreateNew={() => setShowCreateForm(true)}
          />

          {showCreateForm && (
            <CreateSectionForm
              courses={courses}
              terms={terms}
              instructorId={profile.id}
              onCreated={handleSectionCreated}
              onCancel={sections.length > 0 ? () => setShowCreateForm(false) : undefined}
            />
          )}

          {!showCreateForm && activeSectionId && (
            <div style={{ width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setTab('enrollments')} style={tabButtonStyle(tab === 'enrollments')}>
                  ENROLLMENTS
                </button>
                <button onClick={() => setTab('approvals')} style={tabButtonStyle(tab === 'approvals')}>
                  APPROVALS{pendingCount > 0 ? ` (${pendingCount})` : ''}
                </button>
                <button onClick={() => setTab('curves')} style={tabButtonStyle(tab === 'curves')}>
                  CURVES
                </button>
                <button onClick={() => setTab('results')} style={tabButtonStyle(tab === 'results')}>
                  RESULTS
                </button>
                <button onClick={() => setTab('games')} style={tabButtonStyle(tab === 'games')}>
                  GAMES
                </button>
                <button onClick={() => setTab('analytics')} style={tabButtonStyle(tab === 'analytics')}>
                  ANALYTICS
                </button>
                <button onClick={() => setTab('teams')} style={tabButtonStyle(tab === 'teams')}>
                  TEAMS
                </button>
              </div>

              {tab === 'enrollments' && <EnrollmentsPanel sectionId={activeSectionId} />}
              {tab === 'approvals' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <ClaimsApprovalQueue sectionId={activeSectionId} />
                  <GrantPointsForm sectionId={activeSectionId} />
                </div>
              )}
              {tab === 'curves' && <PayoutCurveManager sectionId={activeSectionId} />}
              {tab === 'results' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <ResultUploadPanel
                    sectionId={activeSectionId}
                    uploaderId={profile.id}
                    source="wuclap"
                    onPosted={() => setResultsRefreshKey((k) => k + 1)}
                  />
                  <ResultSetHistory key={resultsRefreshKey} sectionId={activeSectionId} sourceFilter="wuclap" />
                </div>
              )}
              {tab === 'games' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <GamesManagerPanel
                    sectionId={activeSectionId}
                    onGoToCurves={() => setTab('curves')}
                    onChanged={() => setGamesRefreshKey((k) => k + 1)}
                  />
                  <ResultUploadPanel
                    sectionId={activeSectionId}
                    uploaderId={profile.id}
                    source="game_upload"
                    games={games}
                    onPosted={() => setGamesResultsRefreshKey((k) => k + 1)}
                  />
                  <ResultSetHistory key={gamesResultsRefreshKey} sectionId={activeSectionId} sourceFilter="game_upload" />
                </div>
              )}
              {tab === 'analytics' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <GradebookUploadPanel
                    sectionId={activeSectionId}
                    uploaderId={profile.id}
                    onPosted={() => setGradebookRefreshKey((k) => k + 1)}
                  />
                  <GradebookUploadHistory key={gradebookRefreshKey} sectionId={activeSectionId} refreshKey={gradebookRefreshKey} />
                  <AnalyticsDashboard sectionId={activeSectionId} refreshKey={gradebookRefreshKey} />
                </div>
              )}
              {tab === 'teams' && <TeamsAdminPanel sectionId={activeSectionId} />}
            </div>
          )}
        </>
      )}

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
        Sign out
      </button>
    </div>
  )
}

function tabButtonStyle(active) {
  return {
    padding: '6px 16px',
    borderRadius: 'var(--radius-pill)',
    border: `1px solid ${active ? 'var(--steel-light)' : 'var(--border-steel)'}`,
    background: active ? 'var(--navy-card)' : 'transparent',
    color: active ? 'var(--cream)' : 'var(--text-dim)',
    fontFamily: 'var(--font-ui)',
    fontSize: 13,
    letterSpacing: 1,
    cursor: 'pointer',
  }
}
