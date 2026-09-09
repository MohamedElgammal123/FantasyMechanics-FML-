import { useCallback, useEffect, useState } from 'react'
import { createPayoutCurve, listPayoutCurves, setWuclapDefaultCurve, updatePayoutCurve } from '../lib/instructorData'
import { validateCurve } from '../engine/curve'

const emptyForm = { name: '', top_points: 10, step: 1, ranked_cutoff: 8, participation_floor: 1 }

export default function PayoutCurveManager({ sectionId }) {
  const [curves, setCurves] = useState(null)
  const [error, setError] = useState(null)

  const [editingId, setEditingId] = useState(null) // null = creating new
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [defaultBusyId, setDefaultBusyId] = useState(null)
  const [defaultError, setDefaultError] = useState(null)

  const refetch = useCallback(async () => {
    setError(null)
    try {
      setCurves(await listPayoutCurves(sectionId))
    } catch (err) {
      setError(err.message)
    }
  }, [sectionId])

  useEffect(() => {
    setCurves(null)
    refetch()
  }, [refetch])

  function startEdit(curve) {
    setEditingId(curve.id)
    setForm({
      name: curve.name,
      top_points: curve.top_points,
      step: curve.step,
      ranked_cutoff: curve.ranked_cutoff,
      participation_floor: curve.participation_floor,
    })
    setFormError(null)
  }

  function startNew() {
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
  }

  function numField(key) {
    return {
      value: form[key],
      onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value === '' ? '' : Number(e.target.value) })),
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)

    const curve = {
      top_points: Number(form.top_points),
      step: Number(form.step),
      ranked_cutoff: Number(form.ranked_cutoff),
      participation_floor: Number(form.participation_floor),
    }
    if (!form.name.trim()) {
      setFormError('Name is required.')
      return
    }
    const check = validateCurve(curve)
    if (!check.ok) {
      setFormError(check.error)
      return
    }

    setSubmitting(true)
    try {
      if (editingId) {
        await updatePayoutCurve(editingId, { name: form.name.trim(), ...curve })
      } else {
        await createPayoutCurve(sectionId, { name: form.name.trim(), ...curve })
      }
      startNew()
      await refetch()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSetDefault(curveId) {
    setDefaultBusyId(curveId)
    setDefaultError(null)
    try {
      await setWuclapDefaultCurve(curveId)
      await refetch()
    } catch (err) {
      setDefaultError(err.message)
    } finally {
      setDefaultBusyId(null)
    }
  }

  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>
  if (!curves) return <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>loading curves…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', maxWidth: 640 }}>
      <div>
        <div style={sectionTitleStyle}>Payout curves ({curves.length})</div>
        {curves.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>No curves yet — create one below.</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Top</th>
                <th style={thStyle}>Step</th>
                <th style={thStyle}>Cutoff</th>
                <th style={thStyle}>Floor</th>
                <th style={thStyle}>Default</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {curves.map((c) => (
                <tr key={c.id}>
                  <td style={tdStyle}>{c.name}</td>
                  <td style={tdStyle}>{c.top_points}</td>
                  <td style={tdStyle}>{c.step}</td>
                  <td style={tdStyle}>{c.ranked_cutoff}</td>
                  <td style={tdStyle}>{c.participation_floor}</td>
                  <td style={tdStyle}>
                    {c.is_wuclap_default ? (
                      <span style={{ color: 'var(--success)' }}>WuClap default</span>
                    ) : (
                      <button
                        onClick={() => handleSetDefault(c.id)}
                        disabled={defaultBusyId === c.id}
                        style={removeButtonStyle}
                      >
                        {defaultBusyId === c.id ? 'Setting…' : 'Set as default'}
                      </button>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <button onClick={() => startEdit(c)} style={removeButtonStyle}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {defaultError && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{defaultError}</div>}
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
        <div style={sectionTitleStyle}>{editingId ? 'Edit curve' : 'New curve'}</div>

        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          style={inputStyle}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={miniLabelStyle}>Top points</div>
            <input type="number" {...numField('top_points')} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={miniLabelStyle}>Step</div>
            <input type="number" {...numField('step')} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={miniLabelStyle}>Ranked cutoff</div>
            <input type="number" {...numField('ranked_cutoff')} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={miniLabelStyle}>Participation floor</div>
            <input type="number" {...numField('participation_floor')} style={inputStyle} />
          </div>
        </div>

        {formError && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{formError}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={submitting} style={primaryButtonStyle}>
            {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Create curve'}
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
