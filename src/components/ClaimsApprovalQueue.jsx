import { useCallback, useEffect, useState } from 'react'
import { approveClaim, fetchPendingClaims, rejectClaim } from '../lib/instructorData'
import { fmtDateShort } from '../lib/format'

// Dense, keyboard-friendly: one row per pending claim, override input +
// Approve/Reject inline — no modal per claim (300-student sections mean
// a reviewer works through dozens of these in one sitting). Rows are
// removed optimistically on action and restored if the RPC rejects.
export default function ClaimsApprovalQueue({ sectionId }) {
  const [claims, setClaims] = useState(null)
  const [error, setError] = useState(null)
  const [rowError, setRowError] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [overrides, setOverrides] = useState({})

  const refetch = useCallback(async () => {
    setError(null)
    try {
      setClaims(await fetchPendingClaims(sectionId))
    } catch (err) {
      setError(err.message)
    }
  }, [sectionId])

  useEffect(() => {
    setClaims(null)
    refetch()
  }, [refetch])

  function removeRow(id) {
    setClaims(rows => rows.filter(r => r.id !== id))
  }

  function restoreRow(claim) {
    setClaims(rows => [...rows, claim].sort((a, b) => a.created_at.localeCompare(b.created_at)))
  }

  async function handleApprove(claim) {
    const overrideRaw = overrides[claim.id]
    const override = overrideRaw === undefined || overrideRaw === '' || Number(overrideRaw) === claim.computed_points
      ? null
      : Number(overrideRaw)
    setBusyId(claim.id)
    setRowError(e => ({ ...e, [claim.id]: null }))
    removeRow(claim.id)
    try {
      await approveClaim(claim.id, override)
    } catch (err) {
      restoreRow(claim)
      setRowError(e => ({ ...e, [claim.id]: err.message }))
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject(claim) {
    setBusyId(claim.id)
    setRowError(e => ({ ...e, [claim.id]: null }))
    removeRow(claim.id)
    try {
      await rejectClaim(claim.id)
    } catch (err) {
      restoreRow(claim)
      setRowError(e => ({ ...e, [claim.id]: err.message }))
    } finally {
      setBusyId(null)
    }
  }

  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>
  if (!claims) return <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>loading claims…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={sectionTitleStyle}>Pending approvals ({claims.length})</div>
      {claims.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>Nothing waiting on you.</div>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Student</th>
              <th style={thStyle}>Activity</th>
              <th style={thStyle}>Lecture</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Pts</th>
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {claims.map(c => (
              <tr key={c.id}>
                <td style={tdStyle}>
                  {c.profiles?.full_name}
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.profiles?.ccid}</div>
                </td>
                <td style={tdStyle}>{c.activity_types?.label ?? c.activity_type_id}</td>
                <td style={tdStyle}>{fmtDateShort(c.lecture_date)}</td>
                <td style={{ ...tdStyle, maxWidth: 320 }}>{c.description}</td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    defaultValue={c.computed_points}
                    onChange={e => setOverrides(o => ({ ...o, [c.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleApprove(c) } }}
                    disabled={busyId === c.id}
                    style={overrideStyle}
                  />
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => handleApprove(c)} disabled={busyId === c.id} style={approveButtonStyle}>
                      Approve
                    </button>
                    <button onClick={() => handleReject(c)} disabled={busyId === c.id} style={rejectButtonStyle}>
                      Reject
                    </button>
                  </div>
                  {rowError[c.id] && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4 }}>{rowError[c.id]}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const sectionTitleStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
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
  verticalAlign: 'top',
}

const overrideStyle = {
  width: 64,
  padding: '4px 6px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-steel)',
  background: 'var(--navy)',
  color: 'var(--text-body)',
  fontFamily: 'var(--font-mono)',
}

const approveButtonStyle = {
  padding: '4px 10px',
  borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--success)',
  background: 'transparent',
  color: 'var(--success)',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'var(--font-ui)',
}

const rejectButtonStyle = {
  padding: '4px 10px',
  borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--danger)',
  background: 'transparent',
  color: 'var(--danger)',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'var(--font-ui)',
}
