import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addPendingEnrollment,
  bulkAddPendingEnrollments,
  deletePendingEnrollment,
  listEnrollments,
  listPendingEnrollments,
} from '../lib/instructorData'
import { parseRosterCsv } from '../ingest/parseRosterCsv'

const CSV_PREVIEW_LIMIT = 25

export default function EnrollmentsPanel({ sectionId }) {
  const [enrollments, setEnrollments] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [ccid, setCcid] = useState('')
  const [fullName, setFullName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [removingId, setRemovingId] = useState(null)

  const fileInputRef = useRef(null)
  const [csvFileName, setCsvFileName] = useState(null)
  const [csvRows, setCsvRows] = useState([])
  const [csvErrors, setCsvErrors] = useState([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvSubmitError, setCsvSubmitError] = useState(null)
  const [csvSummary, setCsvSummary] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [enrolled, staged] = await Promise.all([
        listEnrollments(sectionId),
        listPendingEnrollments(sectionId),
      ])
      setEnrollments(enrolled)
      setPending(staged)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [sectionId])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function handleAdd(e) {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      await addPendingEnrollment(sectionId, ccid, fullName)
      setCcid('')
      setFullName('')
      await refetch()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove(id) {
    setRemovingId(id)
    try {
      await deletePendingEnrollment(id)
      await refetch()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setRemovingId(null)
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvSummary(null)
    setCsvSubmitError(null)
    setCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const { rows, errors } = parseRosterCsv(String(reader.result))
      setCsvRows(rows)
      setCsvErrors(errors)
    }
    reader.readAsText(file)
  }

  function clearCsv() {
    setCsvFileName(null)
    setCsvRows([])
    setCsvErrors([])
    setCsvSummary(null)
    setCsvSubmitError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleCsvImport() {
    setCsvImporting(true)
    setCsvSubmitError(null)
    try {
      const summary = await bulkAddPendingEnrollments(
        csvRows.map((r) => ({ ccid: r.ccid, fullName: r.fullName, sectionId }))
      )
      setCsvSummary(summary)
      if (summary.errors.length === 0) {
        await refetch()
      }
    } catch (err) {
      setCsvSubmitError(err.message)
    } finally {
      setCsvImporting(false)
    }
  }

  if (loading) {
    return <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>loading roster…</div>
  }

  if (error) {
    return <div style={{ color: 'var(--danger)' }}>{error}</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%', maxWidth: 640 }}>
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <input
          placeholder="CCID"
          value={ccid}
          onChange={(e) => setCcid(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          style={{ ...inputStyle, flex: 2 }}
        />
        <button type="submit" disabled={submitting} style={primaryButtonStyle}>
          {submitting ? 'Adding…' : '+ Add test student'}
        </button>
      </form>
      {formError && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{formError}</div>}

      <div>
        <div style={sectionTitleStyle}>Import roster (CSV)</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} style={{ color: 'var(--text-body)', fontSize: 13 }} />
          {csvFileName && (
            <button onClick={clearCsv} style={removeButtonStyle}>
              Clear
            </button>
          )}
        </div>

        {csvFileName && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              {csvFileName}: {csvRows.length} row{csvRows.length === 1 ? '' : 's'} parsed
              {csvErrors.length > 0 ? `, ${csvErrors.length} error${csvErrors.length === 1 ? '' : 's'}` : ''}
            </div>

            {csvErrors.length > 0 && (
              <div style={{ color: 'var(--danger)', fontSize: 13 }}>
                {csvErrors.map((e, i) => (
                  <div key={i}>
                    Line {e.line ?? '?'}: {e.message}
                  </div>
                ))}
              </div>
            )}

            {csvRows.length > 0 && (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>CCID</th>
                    <th style={thStyle}>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, CSV_PREVIEW_LIMIT).map((r) => (
                    <tr key={r.ccid}>
                      <td style={tdStyle}>{r.ccid}</td>
                      <td style={tdStyle}>{r.fullName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {csvRows.length > CSV_PREVIEW_LIMIT && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                + {csvRows.length - CSV_PREVIEW_LIMIT} more (all will be imported)
              </div>
            )}

            {csvRows.length > 0 && (
              <button onClick={handleCsvImport} disabled={csvImporting} style={{ ...primaryButtonStyle, alignSelf: 'flex-start' }}>
                {csvImporting ? 'Importing…' : `Import ${csvRows.length} student${csvRows.length === 1 ? '' : 's'}`}
              </button>
            )}

            {csvSubmitError && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{csvSubmitError}</div>}

            {csvSummary && (
              <div style={{ fontSize: 13 }}>
                {csvSummary.errors.length === 0 ? (
                  <span style={{ color: 'var(--success)' }}>
                    Inserted {csvSummary.inserted}, updated {csvSummary.updated}, already linked (skipped){' '}
                    {csvSummary.skipped_consumed}.
                  </span>
                ) : (
                  <div style={{ color: 'var(--danger)' }}>
                    Import rejected — nothing was written. Fix these and retry:
                    {csvSummary.errors.map((e, i) => (
                      <div key={i}>
                        Row {e.row}: {e.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <div style={sectionTitleStyle}>Roster ({pending.length})</div>
        {pending.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>No students staged yet.</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>CCID</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {pending.map((row) => (
                <tr key={row.id}>
                  <td style={tdStyle}>{row.ccid}</td>
                  <td style={tdStyle}>{row.full_name}</td>
                  <td style={tdStyle}>
                    <span style={{ color: row.consumed_at ? 'var(--success)' : 'var(--warning)' }}>
                      {row.consumed_at ? 'Linked' : 'Awaiting first login'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {!row.consumed_at && (
                      <button
                        onClick={() => handleRemove(row.id)}
                        disabled={removingId === row.id}
                        style={removeButtonStyle}
                      >
                        {removingId === row.id ? 'Removing…' : 'Remove'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <div style={sectionTitleStyle}>Enrolled ({enrollments.length})</div>
        {enrollments.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>No one has logged in yet.</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>CCID</th>
                <th style={thStyle}>Name</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((row) => (
                <tr key={row.id}>
                  <td style={tdStyle}>{row.profiles?.ccid}</td>
                  <td style={tdStyle}>{row.profiles?.full_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const inputStyle = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-steel)',
  background: 'var(--navy-card)',
  color: 'var(--text-body)',
  fontFamily: 'var(--font-body)',
  flex: 1,
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
}

const removeButtonStyle = {
  padding: '2px 10px',
  borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--border-steel)',
  background: 'transparent',
  color: 'var(--danger)',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'var(--font-ui)',
}

const sectionTitleStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
  marginBottom: 8,
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
}

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
