import { useMemo, useState } from 'react'
import { claimValue, nthClaimIndex, checkWeeklyCap } from '../engine/claims'
import { weekNumberFor } from '../engine/weeks'
import { fmtDateShort } from '../lib/format'

function todayLocalDate() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Last valid lecture date, inclusive — mirrors the SQL check in
// submit_claim exactly: p_lecture_date <= (week1_start + weeks_total*7 days).
function termEndDate(term) {
  const ms = Date.parse(`${term.week1_start}T00:00:00Z`) + term.weeks_total * 7 * 86400000
  const d = new Date(ms)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// Today if it falls inside the term; otherwise the nearest in-term edge —
// avoids opening the form on a date the student would just have to change.
function defaultLectureDate(term) {
  const today = todayLocalDate()
  const end = termEndDate(term)
  if (today < term.week1_start) return term.week1_start
  if (today > end) return end
  return today
}

// Client-side preview only — mirrors the engine math the server
// (submit_claim RPC) recomputes authoritatively. Never trust this value
// as what gets stored; it exists so the student sees the number before
// committing to a submission.
export default function ClaimSubmitForm({ term, weeklyClaimCap, claimTypes, claimRules, existingClaims, onSubmit }) {
  const [activityTypeId, setActivityTypeId] = useState(claimTypes[0]?.id ?? '')
  const [lectureDate, setLectureDate] = useState(() => defaultLectureDate(term))
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const rule = useMemo(
    () => claimRules.find(r => r.activity_type_id === activityTypeId) ?? null,
    [claimRules, activityTypeId]
  )

  // Friendly, own validation instead of relying on the browser's native
  // min/max constraint messages ("Minimum date must come before Maximum
  // date" reads as machine-speak, not something a student should have to
  // parse) — no min/max attributes on the input at all.
  const dateValidity = useMemo(() => {
    const today = todayLocalDate()
    const end = termEndDate(term)
    if (lectureDate > today) return { ok: false, message: "Lecture date can't be in the future." }
    if (lectureDate < term.week1_start || lectureDate > end) {
      return {
        ok: false,
        message: `Lecture date must be within the current term (${fmtDateShort(term.week1_start)} – ${fmtDateShort(end)}).`,
      }
    }
    return { ok: true }
  }, [lectureDate, term])

  const preview = useMemo(() => {
    if (!rule || !dateValidity.ok) return null
    const nth = nthClaimIndex(existingClaims, activityTypeId, lectureDate)
    const value = claimValue(rule, nth)
    const weekNumber = weekNumberFor(term.week1_start, term.weeks_total, `${lectureDate}T00:00:00Z`)
    const { blocked } = checkWeeklyCap(existingClaims, weekNumber, weeklyClaimCap, value)
    return { nth, value, blocked }
  }, [rule, dateValidity, existingClaims, activityTypeId, lectureDate, term, weeklyClaimCap])

  const blocked = !dateValidity.ok || preview?.blocked

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!dateValidity.ok) {
      setError(dateValidity.message)
      return
    }
    if (description.trim() === '') {
      setError('Description is required.')
      return
    }
    setSubmitting(true)
    try {
      const claim = await onSubmit(activityTypeId, lectureDate, description)
      setDescription('')
      return claim
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (claimTypes.length === 0) return null

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: 'var(--navy-card)',
        border: '1px solid var(--border-steel)',
        borderRadius: 'var(--radius-md)',
        padding: '20px 24px',
        marginBottom: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 17, letterSpacing: 2, color: 'var(--cream)' }}>
        SUBMIT A CLAIM
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <select value={activityTypeId} onChange={e => setActivityTypeId(e.target.value)} style={inputStyle}>
          {claimTypes.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={lectureDate}
          onChange={e => setLectureDate(e.target.value)}
          required
          style={inputStyle}
        />
      </div>

      {!dateValidity.ok && (
        <div style={{ fontSize: 13, color: 'var(--danger)' }}>{dateValidity.message}</div>
      )}

      <input
        placeholder="What happened? (e.g. caught a sign error in the moment equation)"
        value={description}
        onChange={e => setDescription(e.target.value)}
        required
        style={inputStyle}
      />

      {preview && (
        <div style={{ fontSize: 14, color: preview.blocked ? 'var(--danger)' : 'var(--steel-light)' }}>
          {preview.blocked
            ? 'Weekly claim cap reached — resets Monday.'
            : `This claim is worth ${preview.value} pts${preview.nth > 1 ? ` (${ordinal(preview.nth)} ${claimTypes.find(t => t.id === activityTypeId)?.label.toLowerCase()} this lecture)` : ''}.`}
        </div>
      )}

      {error && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</div>}

      <button
        type="submit"
        disabled={submitting || blocked}
        style={{
          alignSelf: 'flex-start',
          padding: '8px 20px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-steel-strong)',
          background: 'var(--steel)',
          color: 'var(--cream)',
          fontFamily: 'var(--font-ui)',
          fontWeight: 700,
          letterSpacing: 1,
          cursor: submitting || blocked ? 'not-allowed' : 'pointer',
          opacity: submitting || blocked ? 0.6 : 1,
        }}
      >
        {submitting ? 'SUBMITTING…' : 'SUBMIT CLAIM'}
      </button>
    </form>
  )
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
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
