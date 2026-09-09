import { useCallback, useEffect, useState } from 'react'
import { createGame, listGames, listPayoutCurves, updateGame } from '../lib/instructorData'

const emptyForm = { title: '', blurb: '', matchday: 1, launch_url: '', opens_at: '', closes_at: '', payout_curve_id: '' }

function toLocalInputValue(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// GAMES tab (P7) — instructor CRUD, mirrors PayoutCurveManager's
// list+form layout. Curve picker is pick-from-existing only (one
// curve-creation UI, on the CURVES tab) — see onGoToCurves.
export default function GamesManagerPanel({ sectionId, onGoToCurves, onChanged }) {
  const [games, setGames] = useState(null)
  const [curves, setCurves] = useState([])
  const [error, setError] = useState(null)

  const [editingId, setEditingId] = useState(null) // null = creating new
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const refetch = useCallback(async () => {
    setError(null)
    try {
      const [g, c] = await Promise.all([listGames(sectionId), listPayoutCurves(sectionId)])
      setGames(g)
      setCurves(c)
    } catch (err) {
      setError(err.message)
    }
  }, [sectionId])

  useEffect(() => {
    setGames(null)
    refetch()
  }, [refetch])

  // curves load asynchronously, after the form's initial render — without
  // this, the "new game" select visually shows its first <option> as
  // selected (the browser's default when value="" matches nothing) while
  // form.payout_curve_id stays '', so submit fails "A payout curve is
  // required" until the instructor manually re-picks the same option.
  // Only backfills the still-empty new-game form, never overwrites an
  // in-progress edit or a manual selection.
  useEffect(() => {
    if (editingId) return
    setForm((f) => (f.payout_curve_id || curves.length === 0 ? f : { ...f, payout_curve_id: curves[0].id }))
  }, [curves, editingId])

  function startEdit(game) {
    setEditingId(game.id)
    setForm({
      title: game.title,
      blurb: game.blurb ?? '',
      matchday: game.matchday,
      launch_url: game.launch_url,
      opens_at: toLocalInputValue(game.opens_at),
      closes_at: toLocalInputValue(game.closes_at),
      payout_curve_id: game.payout_curve_id,
    })
    setFormError(null)
  }

  function startNew() {
    setEditingId(null)
    setForm({ ...emptyForm, payout_curve_id: curves[0]?.id ?? '' })
    setFormError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)

    if (!form.title.trim()) {
      setFormError('Title is required.')
      return
    }
    if (!form.launch_url.trim()) {
      setFormError('Launch URL is required.')
      return
    }
    if (!form.opens_at || !form.closes_at) {
      setFormError('Open and close times are both required.')
      return
    }
    if (!form.payout_curve_id) {
      setFormError('A payout curve is required.')
      return
    }
    const opensAt = new Date(form.opens_at)
    const closesAt = new Date(form.closes_at)
    if (closesAt <= opensAt) {
      setFormError('Close time must be after open time.')
      return
    }

    const game = {
      title: form.title.trim(),
      blurb: form.blurb.trim() || null,
      matchday: Number(form.matchday),
      launch_url: form.launch_url.trim(),
      opens_at: opensAt.toISOString(),
      closes_at: closesAt.toISOString(),
      payout_curve_id: form.payout_curve_id,
    }

    setSubmitting(true)
    try {
      if (editingId) {
        await updateGame(editingId, game)
      } else {
        await createGame(sectionId, game)
      }
      startNew()
      await refetch()
      onChanged?.()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>
  if (!games) return <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>loading games…</div>

  const noCurves = curves.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', maxWidth: 720 }}>
      <div>
        <div style={sectionTitleStyle}>Games ({games.length})</div>
        {games.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>No fixtures scheduled yet — add one below.</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Matchday</th>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Opens</th>
                <th style={thStyle}>Closes</th>
                <th style={thStyle}>Curve</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td style={tdStyle}>{g.matchday}</td>
                  <td style={tdStyle}>{g.title}</td>
                  <td style={tdStyle}>{new Date(g.opens_at).toLocaleString()}</td>
                  <td style={tdStyle}>{new Date(g.closes_at).toLocaleString()}</td>
                  <td style={tdStyle}>{curves.find((c) => c.id === g.payout_curve_id)?.name ?? '—'}</td>
                  <td style={tdStyle}>
                    <button onClick={() => startEdit(g)} style={removeButtonStyle}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          background: 'var(--navy-card)',
          border: '1px solid var(--border-steel)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
        }}
      >
        <div style={sectionTitleStyle}>{editingId ? 'Edit game' : 'New game'}</div>

        <input
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          style={inputStyle}
        />
        <input
          placeholder="Blurb"
          value={form.blurb}
          onChange={(e) => setForm((f) => ({ ...f, blurb: e.target.value }))}
          style={inputStyle}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={miniLabelStyle}>Matchday</div>
            <input
              type="number"
              value={form.matchday}
              onChange={(e) => setForm((f) => ({ ...f, matchday: e.target.value === '' ? '' : Number(e.target.value) }))}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 2 }}>
            <div style={miniLabelStyle}>Launch URL</div>
            <input
              value={form.launch_url}
              onChange={(e) => setForm((f) => ({ ...f, launch_url: e.target.value }))}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={miniLabelStyle}>Opens</div>
            <input
              type="datetime-local"
              value={form.opens_at}
              onChange={(e) => setForm((f) => ({ ...f, opens_at: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={miniLabelStyle}>Closes</div>
            <input
              type="datetime-local"
              value={form.closes_at}
              onChange={(e) => setForm((f) => ({ ...f, closes_at: e.target.value }))}
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <div style={miniLabelStyle}>Payout curve</div>
          {noCurves ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select disabled style={{ ...inputStyle, opacity: 0.5 }}>
                <option>No curves yet</option>
              </select>
              <button type="button" onClick={onGoToCurves} style={removeButtonStyle}>
                Create a curve first →
              </button>
            </div>
          ) : (
            <select
              value={form.payout_curve_id}
              onChange={(e) => setForm((f) => ({ ...f, payout_curve_id: e.target.value }))}
              style={inputStyle}
            >
              {curves.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {formError && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{formError}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={submitting || noCurves} style={primaryButtonStyle}>
            {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Create game'}
          </button>
          {editingId && (
            <button type="button" onClick={startNew} style={removeButtonStyle}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

const sectionTitleStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
  marginBottom: 8,
}

const miniLabelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--text-dim)',
  marginBottom: 4,
}

const inputStyle = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-steel)',
  background: 'var(--navy)',
  color: 'var(--text-body)',
  fontFamily: 'var(--font-body)',
  width: '100%',
  boxSizing: 'border-box',
}

const primaryButtonStyle = {
  padding: '8px 16px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-steel-strong)',
  background: 'var(--navy-card)',
  color: 'var(--text-body)',
  fontFamily: 'var(--font-ui)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  alignSelf: 'flex-start',
}

const removeButtonStyle = {
  padding: '2px 10px',
  borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--border-steel)',
  background: 'transparent',
  color: 'var(--steel-light)',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'var(--font-ui)',
}

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 14 }

const thStyle = {
  textAlign: 'left',
  padding: '6px 8px',
  color: 'var(--text-dim)',
  borderBottom: '1px solid var(--border-steel)',
  fontWeight: 400,
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
}

const tdStyle = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--border-steel)',
  color: 'var(--text-body)',
}
