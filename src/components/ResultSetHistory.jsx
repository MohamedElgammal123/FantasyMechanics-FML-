import { useCallback, useEffect, useState } from 'react'
import { getResultSetPointEvents, getResultSetRows, listResultSets, voidResultSet } from '../lib/instructorData'

export default function ResultSetHistory({ sectionId, sourceFilter = null }) {
  const [sets, setSets] = useState(null)
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState(null)
  const [confirmingVoid, setConfirmingVoid] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [voidError, setVoidError] = useState(null)

  const refetch = useCallback(async () => {
    setError(null)
    try {
      setSets(await listResultSets(sectionId, sourceFilter))
    } catch (err) {
      setError(err.message)
    }
  }, [sectionId, sourceFilter])

  useEffect(() => {
    setSets(null)
    refetch()
  }, [refetch])

  async function loadDetail(resultSetId) {
    setDetailError(null)
    try {
      const [rows, events] = await Promise.all([getResultSetRows(resultSetId), getResultSetPointEvents(resultSetId)])
      const pointsByStudent = new Map()
      events.forEach((e) => pointsByStudent.set(e.student_id, (pointsByStudent.get(e.student_id) ?? 0) + e.points))
      setDetail({ rows, pointsByStudent, netTotal: events.reduce((sum, e) => sum + e.points, 0) })
    } catch (err) {
      setDetailError(err.message)
    }
  }

  function toggleOpen(resultSet) {
    if (openId === resultSet.id) {
      setOpenId(null)
      setDetail(null)
      setConfirmingVoid(false)
      return
    }
    setOpenId(resultSet.id)
    setDetail(null)
    setConfirmingVoid(false)
    setVoidError(null)
    loadDetail(resultSet.id)
  }

  async function handleVoid(resultSet) {
    setVoiding(true)
    setVoidError(null)
    try {
      await voidResultSet(resultSet.id)
      setConfirmingVoid(false)
      await refetch()
      await loadDetail(resultSet.id) // re-fetch to show the now-zeroed net points
    } catch (err) {
      setVoidError(err.message)
    } finally {
      setVoiding(false)
    }
  }

  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>
  if (!sets) return <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>loading result sets…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 720 }}>
      <div style={sectionTitleStyle}>Result sets ({sets.length})</div>
      {sets.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>No results posted yet.</div>
      ) : (
        sets.map((rs) => (
          <div
            key={rs.id}
            style={{
              border: '1px solid var(--border-steel)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--navy-card)',
            }}
          >
            <div
              onClick={() => toggleOpen(rs)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                cursor: 'pointer',
              }}
            >
              <div>
                <div style={{ color: 'var(--text-body)', fontFamily: 'var(--font-ui)' }}>{rs.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {rs.source} · uploaded by {rs.profiles?.full_name ?? '—'} ·{' '}
                  {new Date(rs.uploaded_at).toLocaleString()}
                </div>
              </div>
              <span style={statusStyle(rs.status)}>{rs.status.toUpperCase()}</span>
            </div>

            {openId === rs.id && (
              <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-steel)' }}>
                {detailError && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{detailError}</div>}
                {!detail && !detailError && (
                  <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 12 }}>loading rows…</div>
                )}
                {detail && (
                  <>
                    <table style={{ ...tableStyle, marginTop: 12 }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>CCID</th>
                          <th style={thStyle}>Name</th>
                          <th style={thStyle}>Rank</th>
                          <th style={thStyle}>Score</th>
                          <th style={thStyle}>Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.rows.map((row) => (
                          <tr key={row.id}>
                            <td style={tdStyle}>{row.ccid}</td>
                            <td style={tdStyle}>
                              {row.profiles?.full_name ?? <span style={{ color: 'var(--warning)' }}>unmatched</span>}
                            </td>
                            <td style={tdStyle}>{row.rank ?? '—'}</td>
                            <td style={tdStyle}>{row.raw_score ?? '—'}</td>
                            <td style={tdStyle}>
                              {row.student_id ? detail.pointsByStudent.get(row.student_id) ?? 0 : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {rs.status === 'posted' && (
                      <div style={{ marginTop: 12 }}>
                        {!confirmingVoid ? (
                          <button onClick={() => setConfirmingVoid(true)} style={voidButtonStyle}>
                            Void this result set
                          </button>
                        ) : (
                          <div
                            style={{
                              border: '1px solid var(--danger)',
                              borderRadius: 'var(--radius-sm)',
                              padding: 12,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                            }}
                          >
                            <div style={{ color: 'var(--danger)', fontSize: 13 }}>
                              This posts a compensating negative event for every point_event tied to this set —
                              {' '}{detail.pointsByStudent.size} student{detail.pointsByStudent.size === 1 ? '' : 's'},
                              {' '}{detail.netTotal} total point{Math.abs(detail.netTotal) === 1 ? '' : 's'} reversed
                              to net zero. The ledger stays append-only; this cannot be undone by voiding again.
                            </div>
                            {voidError && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{voidError}</div>}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => handleVoid(rs)} disabled={voiding} style={voidButtonStyle}>
                                {voiding ? 'Voiding…' : 'Confirm void'}
                              </button>
                              <button onClick={() => setConfirmingVoid(false)} disabled={voiding} style={removeButtonStyle}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

function statusStyle(status) {
  const color = status === 'posted' ? 'var(--success)' : status === 'voided' ? 'var(--danger)' : 'var(--warning)'
  return {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color,
    border: `1px solid ${color}`,
    borderRadius: 'var(--radius-pill)',
    padding: '2px 8px',
    whiteSpace: 'nowrap',
  }
}

const sectionTitleStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
}

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }

const thStyle = {
  textAlign: 'left',
  padding: '6px 8px',
  color: 'var(--text-dim)',
  borderBottom: '1px solid var(--border-steel)',
  fontWeight: 400,
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
}

const tdStyle = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--border-steel)',
  color: 'var(--text-body)',
}

const voidButtonStyle = {
  padding: '6px 14px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--danger)',
  background: 'transparent',
  color: 'var(--danger)',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'var(--font-ui)',
  alignSelf: 'flex-start',
}

const removeButtonStyle = {
  padding: '6px 14px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-steel)',
  background: 'transparent',
  color: 'var(--steel-light)',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'var(--font-ui)',
}
