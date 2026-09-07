import { useEffect, useState } from 'react'
import { grantPoints, listEnrollments } from '../lib/instructorData'
import { fetchActivityTypes } from '../lib/studentData'

// Instructor ad-hoc grant ("claim 10 points" without a student submission).
// Exempt from the weekly cap server-side; appears in the student's history
// as an "Instructor award".
export default function GrantPointsForm({ sectionId }) {
  const [roster, setRoster] = useState([])
  const [activityTypes, setActivityTypes] = useState([])
  const [studentId, setStudentId] = useState('')
  const [activityTypeId, setActivityTypeId] = useState('discussion')
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([listEnrollments(sectionId), fetchActivityTypes()]).then(([enrollments, types]) => {
      if (cancelled) return
      setRoster(enrollments)
      setActivityTypes(types)
      setStudentId(enrollments[0]?.student_id ?? '')
    })
    return () => { cancelled = true }
  }, [sectionId])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    const pointsNum = Number(points)
    if (!studentId) { setError('Pick a student.'); return }
    if (!Number.isFinite(pointsNum) || pointsNum === 0) { setError('Enter a nonzero point value.'); return }
    if (reason.trim() === '') { setError('A reason is required.'); return }

    setSubmitting(true)
    try {
      await grantPoints(sectionId, studentId, pointsNum, reason.trim(), activityTypeId)
      setPoints('')
      setReason('')
      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 480,
        background: 'var(--navy-card)',
        border: '1px solid var(--border-steel)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
        Ad-hoc grant
      </div>

      <select value={studentId} onChange={e => setStudentId(e.target.value)} style={inputStyle}>
        {roster.map(r => (
          <option key={r.student_id} value={r.student_id}>{r.profiles?.full_name} ({r.profiles?.ccid})</option>
        ))}
      </select>

      <div style={{ display: 'flex', gap: 8 }}>
        <select value={activityTypeId} onChange={e => setActivityTypeId(e.target.value)} style={inputStyle}>
          {activityTypes.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Points"
          value={points}
          onChange={e => setPoints(e.target.value)}
          style={{ ...inputStyle, flex: '0 0 100px' }}
        />
      </div>

      <input
        placeholder="Reason (required)"
        value={reason}
        onChange={e => setReason(e.target.value)}
        style={inputStyle}
      />

      {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
      {success && <div style={{ color: 'var(--success)', fontSize: 13 }}>Granted.</div>}

      <button
        type="submit"
        disabled={submitting}
        style={{
          alignSelf: 'flex-start',
          padding: '6px 16px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-steel-strong)',
          background: 'var(--navy)',
          color: 'var(--text-body)',
          fontFamily: 'var(--font-ui)',
          cursor: 'pointer',
        }}
      >
        {submitting ? 'Granting…' : 'Grant points'}
      </button>
    </form>
  )
}

const inputStyle = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-steel)',
  background: 'var(--navy)',
  color: 'var(--text-body)',
  fontFamily: 'var(--font-body)',
  flex: 1,
}
