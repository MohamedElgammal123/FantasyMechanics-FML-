import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listMyEnrollments } from '../lib/studentData'
import { weekNumberFor } from '../engine/weeks'
import StudentNav from '../components/StudentNav'
import { ErrorBlock, LoadingBlock } from '../components/DataStates'
import StudentDashboard from './StudentDashboard'
import Leaderboard from './Leaderboard'
import GamesHub from './GamesHub'
import ClaimsHistory from './ClaimsHistory'
import TeamsPage from './TeamsPage'

const StudentSectionContext = createContext(null)

// { profile, sectionId, section, course, term, currentWeek, enrollments }
export function useStudentSection() {
  const ctx = useContext(StudentSectionContext)
  if (!ctx) throw new Error('useStudentSection must be used inside StudentShell')
  return ctx
}

export default function StudentShell() {
  const { profile } = useAuth()
  const [enrollments, setEnrollments] = useState(null) // null = loading
  const [sectionId, setSectionId] = useState(null)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setEnrollments(null)
    listMyEnrollments(profile.id)
      .then(rows => {
        if (cancelled) return
        setEnrollments(rows)
        setSectionId(prev => rows.some(r => r.section_id === prev) ? prev : rows[0]?.section_id ?? null)
      })
      .catch(e => !cancelled && setError(e))
    return () => { cancelled = true }
  }, [profile.id, attempt])

  const value = useMemo(() => {
    const row = enrollments?.find(e => e.section_id === sectionId)
    if (!row) return null
    const section = row.sections
    const term = section.terms
    return {
      profile,
      enrollments,
      sectionId,
      section,
      course: section.courses,
      term,
      currentWeek: weekNumberFor(term.week1_start, term.weeks_total, new Date()),
    }
  }, [enrollments, sectionId, profile])

  if (error) {
    return (
      <div className="bg-blueprint" style={{ minHeight: '100vh', padding: 32 }}>
        <ErrorBlock
          message="Couldn't load your enrollment. Check your connection and retry."
          onRetry={() => setAttempt(a => a + 1)}
        />
      </div>
    )
  }
  if (!enrollments) {
    return (
      <div className="bg-blueprint" style={{ minHeight: '100vh', padding: 32 }}>
        <LoadingBlock height={200} label="loading your season…" />
      </div>
    )
  }
  if (!value) {
    // Linked profile but zero enrollments — shouldn't happen (linking creates
    // one), but render honestly rather than crash.
    return (
      <div
        className="bg-blueprint"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, color: 'var(--cream)' }}>
          NO ACTIVE SECTION
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          You're signed in but not enrolled in any section yet — ask your instructor.
        </div>
      </div>
    )
  }

  return (
    <StudentSectionContext.Provider value={value}>
      <div className="bg-blueprint" style={{ minHeight: '100vh' }}>
        <StudentNav
          enrollments={enrollments}
          sectionId={sectionId}
          onSectionChange={setSectionId}
          section={value.section}
        />
        <Routes>
          <Route path="/" element={<StudentDashboard />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/games" element={<GamesHub />} />
          <Route path="/claims" element={<ClaimsHistory />} />
          {value.section.team_unlock_week != null && <Route path="/teams" element={<TeamsPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </StudentSectionContext.Provider>
  )
}
