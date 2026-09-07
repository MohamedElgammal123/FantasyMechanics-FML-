import { useState } from 'react'
import { createCourse, createTerm, createSection } from '../lib/instructorData'

const todayIso = new Date().toISOString().slice(0, 10)

export default function CreateSectionForm({ courses, terms, instructorId, onCreated, onCancel }) {
  const [courseMode, setCourseMode] = useState(courses.length ? 'existing' : 'new')
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const [newCourseCode, setNewCourseCode] = useState('')
  const [newCourseName, setNewCourseName] = useState('')

  const [termMode, setTermMode] = useState(terms.length ? 'existing' : 'new')
  const [termId, setTermId] = useState(terms[0]?.id ?? '')
  const [newTermName, setNewTermName] = useState('')
  const [newSeasonLabel, setNewSeasonLabel] = useState('')
  const [newWeek1Start, setNewWeek1Start] = useState(todayIso)
  const [newWeeksTotal, setNewWeeksTotal] = useState(13)

  const [sectionCode, setSectionCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      let resolvedCourseId = courseId
      if (courseMode === 'new') {
        const course = await createCourse({ code: newCourseCode.trim(), name: newCourseName.trim() })
        resolvedCourseId = course.id
      }

      let resolvedTermId = termId
      if (termMode === 'new') {
        const term = await createTerm({
          name: newTermName.trim(),
          season_label: newSeasonLabel.trim(),
          week1_start: newWeek1Start,
          weeks_total: Number(newWeeksTotal),
        })
        resolvedTermId = term.id
      }

      const section = await createSection({
        course_id: resolvedCourseId,
        term_id: resolvedTermId,
        code: sectionCode.trim(),
        instructor_id: instructorId,
      })
      onCreated(section)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 380 }}>
      <div style={fieldsetStyle}>
        <div style={labelStyle}>Course</div>
        {courses.length > 0 && (
          <ModeToggle mode={courseMode} onChange={setCourseMode} newLabel="+ New course" />
        )}
        {courseMode === 'existing' ? (
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} style={inputStyle}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Code (ENGG 130)"
              value={newCourseCode}
              onChange={(e) => setNewCourseCode(e.target.value)}
              required
              style={inputStyle}
            />
            <input
              placeholder="Name"
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
        )}
      </div>

      <div style={fieldsetStyle}>
        <div style={labelStyle}>Term</div>
        {terms.length > 0 && (
          <ModeToggle mode={termMode} onChange={setTermMode} newLabel="+ New term" />
        )}
        {termMode === 'existing' ? (
          <select value={termId} onChange={(e) => setTermId(e.target.value)} style={inputStyle}>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.season_label})</option>
            ))}
          </select>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="Name (Winter 2027)"
                value={newTermName}
                onChange={(e) => setNewTermName(e.target.value)}
                required
                style={inputStyle}
              />
              <input
                placeholder="Season label (SEASON 2027)"
                value={newSeasonLabel}
                onChange={(e) => setNewSeasonLabel(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={smallLabelStyle}>
                Week 1 starts
                <input
                  type="date"
                  value={newWeek1Start}
                  onChange={(e) => setNewWeek1Start(e.target.value)}
                  required
                  style={inputStyle}
                />
              </label>
              <label style={smallLabelStyle}>
                Weeks total
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={newWeeksTotal}
                  onChange={(e) => setNewWeeksTotal(e.target.value)}
                  required
                  style={inputStyle}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      <div style={fieldsetStyle}>
        <div style={labelStyle}>Section code</div>
        <input
          placeholder="EB1"
          value={sectionCode}
          onChange={(e) => setSectionCode(e.target.value)}
          required
          style={inputStyle}
        />
      </div>

      {error && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onCancel && (
          <button type="button" onClick={onCancel} style={secondaryButtonStyle}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting} style={primaryButtonStyle}>
          {submitting ? 'Creating…' : 'Create section'}
        </button>
      </div>
    </form>
  )
}

function ModeToggle({ mode, onChange, newLabel }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, fontFamily: 'var(--font-mono)' }}>
      <button
        type="button"
        onClick={() => onChange('existing')}
        style={toggleButtonStyle(mode === 'existing')}
      >
        Existing
      </button>
      <button
        type="button"
        onClick={() => onChange('new')}
        style={toggleButtonStyle(mode === 'new')}
      >
        {newLabel}
      </button>
    </div>
  )
}

function toggleButtonStyle(active) {
  return {
    padding: '4px 10px',
    borderRadius: 'var(--radius-pill)',
    border: `1px solid ${active ? 'var(--border-steel-strong)' : 'var(--border-steel)'}`,
    background: active ? 'var(--navy-card)' : 'transparent',
    color: active ? 'var(--cream)' : 'var(--text-dim)',
    cursor: 'pointer',
  }
}

const fieldsetStyle = { display: 'flex', flexDirection: 'column', gap: 6 }

const labelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
}

const smallLabelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: 'var(--text-dim)',
  flex: 1,
}

const inputStyle = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-steel)',
  background: 'var(--navy-card)',
  color: 'var(--text-body)',
  fontFamily: 'var(--font-body)',
  flex: 1,
  width: '100%',
}

const primaryButtonStyle = {
  padding: '10px 20px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-steel-strong)',
  background: 'var(--navy-card)',
  color: 'var(--text-body)',
  fontFamily: 'var(--font-ui)',
  fontSize: 16,
  cursor: 'pointer',
}

const secondaryButtonStyle = {
  padding: '8px 16px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-steel)',
  background: 'transparent',
  color: 'var(--steel-light)',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
}
