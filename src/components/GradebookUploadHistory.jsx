import { useCallback, useEffect, useState } from 'react'
import { deleteGradebookUpload, getGradebookMatchCounts, getGradebookRows, listGradebookUploads } from '../lib/instructorData'

export default function GradebookUploadHistory({ sectionId, refreshKey }) {
  const [uploads, setUploads] = useState(null)
  const [matchCounts, setMatchCounts] = useState(new Map())
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [rows, setRows] = useState(null)
  const [rowsError, setRowsError] = useState(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  // Fetched eagerly (not just on expand) so "N of M matched" is visible at
  // a glance in the collapsed header, per Ahmed's 2026-08-18 tour finding —
  // one lightweight query for all uploads rather than a per-row fetch.
  const refetch = useCallback(async () => {
    setError(null)
    try {
      const list = await listGradebookUploads(sectionId)
      setUploads(list)
      setMatchCounts(await getGradebookMatchCounts(list.map((u) => u.id)))
    } catch (err) {
      setError(err.message)
    }
  }, [sectionId])

  useEffect(() => {
    setUploads(null)
    refetch()
  }, [refetch, refreshKey])

  function toggleOpen(upload) {
    if (openId === upload.id) {
      setOpenId(null)
      setRows(null)
      setConfirmingDeleteId(null)
      return
    }
    setOpenId(upload.id)
    setRows(null)
    setRowsError(null)
    setConfirmingDeleteId(null)
    getGradebookRows(upload.id)
      .then(setRows)
      .catch((err) => setRowsError(err.message))
  }

  async function handleDelete(upload) {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteGradebookUpload(upload.id)
      setConfirmingDeleteId(null)
      setOpenId(null)
      setRows(null)
      await refetch()
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>
  if (!uploads) return <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>loading gradebook uploads…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 720 }}>
      <div style={sectionTitleStyle}>Gradebook uploads ({uploads.length})</div>
      {uploads.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>No gradebook uploaded yet.</div>
      ) : (
        uploads.map((u) => (
          <div
            key={u.id}
            style={{ border: '1px solid var(--border-steel)', borderRadius: 'var(--radius-md)', background: 'var(--navy-card)' }}
          >
            <div
              onClick={() => toggleOpen(u)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                cursor: 'pointer',
              }}
            >
              <div>
                <div style={{ color: 'var(--text-body)', fontFamily: 'var(--font-ui)' }}>{u.file_name ?? 'gradebook.csv'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  uploaded by {u.profiles?.full_name ?? '—'} · {new Date(u.uploaded_at).toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {matchCounts.has(u.id) && (
                  <span style={matchStyle(matchCounts.get(u.id))}>
                    {matchCounts.get(u.id).matched} of {matchCounts.get(u.id).total} matched
                  </span>
                )}
                {u.is_baseline && <span style={baselineStyle}>BASELINE</span>}
              </div>
            </div>

            {openId === u.id && (
              <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-steel)' }}>
                {rowsError && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{rowsError}</div>}
                {!rows && !rowsError && <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 12 }}>loading rows…</div>}
                {rows && (
                  <>
                    <table style={{ ...tableStyle, marginTop: 12 }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>CCID</th>
                          <th style={thStyle}>Name</th>
                          <th style={thStyle}>Final grade</th>
                          <th style={thStyle}>Letter</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id}>
                            <td style={tdStyle}>{row.ccid}</td>
                            <td style={tdStyle}>
                              {row.profiles?.full_name ?? <span style={{ color: 'var(--warning)' }}>unmatched</span>}
                            </td>
                            <td style={tdStyle}>{row.final_grade ?? <span style={{ color: 'var(--text-dim)' }}>ungraded</span>}</td>
                            <td style={tdStyle}>{row.letter_grade ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div style={{ marginTop: 12 }}>
                      {confirmingDeleteId !== u.id ? (
                        <button onClick={() => setConfirmingDeleteId(u.id)} style={deleteButtonStyle}>
                          Delete this upload
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
                            This removes the upload and all {rows.length} of its rows. Not a ledger table — this is a
                            plain delete, unlike voiding a result set.
                          </div>
                          {deleteError && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{deleteError}</div>}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => handleDelete(u)} disabled={deleting} style={deleteButtonStyle}>
                              {deleting ? 'Deleting…' : 'Confirm delete'}
                            </button>
                            <button onClick={() => setConfirmingDeleteId(null)} disabled={deleting} style={removeButtonStyle}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
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

// Unmatched rows are expected (not necessarily broken) — amber flags it
// for attention without reading as an error, red only when nothing at all
// matched (the most likely sign something's actually wrong).
function matchStyle({ matched, total }) {
  const color = total === 0 || matched === total ? 'var(--text-dim)' : matched === 0 ? 'var(--danger)' : 'var(--warning)'
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

const baselineStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--warning)',
  border: '1px solid var(--warning)',
  borderRadius: 'var(--radius-pill)',
  padding: '2px 8px',
  whiteSpace: 'nowrap',
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

const deleteButtonStyle = {
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
