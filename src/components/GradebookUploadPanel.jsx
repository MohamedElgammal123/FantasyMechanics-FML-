import { useEffect, useMemo, useRef, useState } from 'react'
import { createGradebookUpload, insertGradebookRows, listEnrollments } from '../lib/instructorData'
import { parseGradebookCsv } from '../ingest/parseGradebookCsv'
import { matchCcids } from '../ingest/matchCcids'

// Gradebook CSV upload (P10, data model §9) — same parse → preview → post
// shape as ResultUploadPanel, minus ranking/curve (a gradebook row isn't a
// ranked competitive result, just a final grade to join against the ledger
// at analytics read-time).
export default function GradebookUploadPanel({ sectionId, uploaderId, onPosted }) {
  const fileInputRef = useRef(null)
  const [fileName, setFileName] = useState(null)
  const [parseResult, setParseResult] = useState(null) // { rows, errors }
  const [enrollments, setEnrollments] = useState([])
  const [isBaseline, setIsBaseline] = useState(false)
  const [removedLines, setRemovedLines] = useState(() => new Set())
  const [ccidOverrides, setCcidOverrides] = useState({})
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState(null)
  const [postSuccess, setPostSuccess] = useState(null)

  useEffect(() => {
    let cancelled = false
    listEnrollments(sectionId).then((e) => {
      if (!cancelled) setEnrollments(e)
    })
    return () => {
      cancelled = true
    }
  }, [sectionId])

  const normalizedEnrollments = useMemo(
    () =>
      enrollments.map((e) => ({
        ccid: e.profiles?.ccid ?? '',
        student_id: e.student_id,
        fullName: e.profiles?.full_name ?? '',
      })),
    [enrollments]
  )

  const matched = useMemo(() => {
    if (!parseResult) return []
    const withOverrides = parseResult.rows.map((r) =>
      ccidOverrides[r.line] !== undefined ? { ...r, ccid: ccidOverrides[r.line] } : r
    )
    return matchCcids(withOverrides, normalizedEnrollments)
  }, [parseResult, ccidOverrides, normalizedEnrollments])

  const preview = useMemo(() => matched.filter((r) => !removedLines.has(r.line)), [matched, removedLines])

  function resetForm() {
    setFileName(null)
    setParseResult(null)
    setRemovedLines(new Set())
    setCcidOverrides({})
    setIsBaseline(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPostSuccess(null)
    setPostError(null)
    setRemovedLines(new Set())
    setCcidOverrides({})
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => setParseResult(parseGradebookCsv(String(reader.result)))
    reader.readAsText(file)
  }

  function toggleRemove(line) {
    setRemovedLines((prev) => {
      const next = new Set(prev)
      if (next.has(line)) next.delete(line)
      else next.add(line)
      return next
    })
  }

  async function handlePost() {
    setPosting(true)
    setPostError(null)
    try {
      const upload = await createGradebookUpload(sectionId, { fileName, uploadedBy: uploaderId, isBaseline })
      await insertGradebookRows(
        upload.id,
        preview.map((r) => ({
          ccid: r.ccid,
          student_id: r.student_id,
          finalGrade: r.finalGrade,
          letterGrade: r.letterGrade,
        }))
      )
      setPostSuccess({ fileName, count: preview.length, matchedCount, isBaseline })
      resetForm()
      onPosted?.()
    } catch (err) {
      setPostError(err.message)
    } finally {
      setPosting(false)
    }
  }

  const matchedCount = preview.filter((r) => r.student_id).length
  const unmatchedCount = preview.length - matchedCount
  const gradedCount = preview.filter((r) => r.finalGrade != null).length

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        width: '100%',
        maxWidth: 900,
        background: 'var(--navy-card)',
        border: '1px solid var(--border-steel)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
      }}
    >
      <div style={sectionTitleStyle}>Upload gradebook</div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          style={{ color: 'var(--text-body)', fontSize: 13 }}
        />
        {fileName && (
          <button onClick={resetForm} style={removeButtonStyle}>
            Clear
          </button>
        )}
      </div>

      {parseResult && (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            {fileName}: {parseResult.rows.length} row{parseResult.rows.length === 1 ? '' : 's'} parsed
            {parseResult.errors.length > 0 ? `, ${parseResult.errors.length} error${parseResult.errors.length === 1 ? '' : 's'}` : ''}
          </div>

          {parseResult.errors.length > 0 && (
            <div style={{ color: 'var(--danger)', fontSize: 13 }}>
              {parseResult.errors.map((e, i) => (
                <div key={i}>
                  Line {e.line ?? '?'}: {e.message}
                </div>
              ))}
            </div>
          )}

          {preview.length > 0 && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-body)' }}>
                <input type="checkbox" checked={isBaseline} onChange={(e) => setIsBaseline(e.target.checked)} />
                This is a pre-FML baseline gradebook (historical cohort, for before/after comparison)
              </label>

              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                <strong style={{ color: unmatchedCount > 0 ? 'var(--warning)' : 'var(--text-body)' }}>
                  {matchedCount} of {preview.length} rows matched
                </strong>
                {' · '}
                {gradedCount} graded, {preview.length - gradedCount} ungraded
              </div>
              {unmatchedCount === preview.length && preview.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  0 of {preview.length} matched usually means these ccids aren't enrolled yet — matching is against
                  linked enrollments, not the pending-enrollment staging list. Expected on dev/fixture data.
                </div>
              )}

              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>CCID</th>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Final grade</th>
                    <th style={thStyle}>Letter</th>
                    <th style={thStyle} />
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.line} style={removedLines.has(r.line) ? { opacity: 0.4 } : undefined}>
                      <td style={tdStyle}>
                        {r.student_id ? (
                          r.ccid
                        ) : (
                          <input
                            defaultValue={r.ccid}
                            onBlur={(e) => setCcidOverrides((prev) => ({ ...prev, [r.line]: e.target.value.trim() }))}
                            style={{ ...inputStyle, padding: '2px 6px', fontSize: 12 }}
                          />
                        )}
                      </td>
                      <td style={tdStyle}>
                        {r.matchedName ?? <span style={{ color: 'var(--warning)' }}>unmatched — {r.fullName}</span>}
                      </td>
                      <td style={tdStyle}>{r.finalGrade ?? <span style={{ color: 'var(--text-dim)' }}>ungraded</span>}</td>
                      <td style={tdStyle}>{r.letterGrade ?? '—'}</td>
                      <td style={tdStyle}>
                        <button onClick={() => toggleRemove(r.line)} style={removeButtonStyle}>
                          {removedLines.has(r.line) ? 'Undo' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {postError && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{postError}</div>}

              <button onClick={handlePost} disabled={posting} style={{ ...primaryButtonStyle, alignSelf: 'flex-start' }}>
                {posting ? 'Uploading…' : `Upload ${preview.length} row${preview.length === 1 ? '' : 's'}`}
              </button>
            </>
          )}
        </>
      )}

      {postSuccess && (
        <div style={{ color: 'var(--success)', fontSize: 13 }}>
          Uploaded "{postSuccess.fileName}" — {postSuccess.matchedCount} of {postSuccess.count} rows matched
          {postSuccess.isBaseline ? ' (baseline cohort)' : ''}.
        </div>
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
  background: 'var(--navy)',
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
  color: 'var(--steel-light)',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'var(--font-ui)',
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
