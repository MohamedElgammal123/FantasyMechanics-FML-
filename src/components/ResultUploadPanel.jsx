import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createResultSet,
  insertResultRows,
  listEnrollments,
  listPayoutCurves,
  postResultSet,
} from '../lib/instructorData'
import { parseWuclapCsv } from '../ingest/parseWuclapCsv'
import { parseGameCsv } from '../ingest/parseGameCsv'
import { matchCcids } from '../ingest/matchCcids'
import { rankResultRows } from '../engine/results'
import { curvePoints } from '../engine/curve'

// Shared WuClap/game-close-out upload flow (parse → preview → post), per
// the data model's shared result_sets/result_rows shape (§4). The two
// sources differ only in: which parser runs, and how the curve is chosen —
// wuclap picks a curve directly; game_upload picks a game, whose curve
// (games.payout_curve_id) comes along for the ride, not independently
// selectable. Everything downstream (matching, ranking, points, posting)
// is identical and source-agnostic.
export default function ResultUploadPanel({ sectionId, uploaderId, source, games = [], onPosted }) {
  const isGame = source === 'game_upload'
  const fileInputRef = useRef(null)
  const [fileName, setFileName] = useState(null)
  const [parseResult, setParseResult] = useState(null) // { rows, errors, notices }

  const [enrollments, setEnrollments] = useState([])
  const [curves, setCurves] = useState([])
  const [curveId, setCurveId] = useState('')
  const [gameId, setGameId] = useState('')
  const [label, setLabel] = useState('')

  const [removedLines, setRemovedLines] = useState(() => new Set())
  const [ccidOverrides, setCcidOverrides] = useState({}) // line -> manually-typed ccid

  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState(null)
  const [postSuccess, setPostSuccess] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([listEnrollments(sectionId), listPayoutCurves(sectionId)]).then(([e, c]) => {
      if (cancelled) return
      setEnrollments(e)
      setCurves(c)
      if (!isGame) {
        const defaultCurve = c.find((cv) => cv.is_wuclap_default) ?? c[0]
        if (defaultCurve) setCurveId(defaultCurve.id)
      }
    })
    return () => {
      cancelled = true
    }
  }, [sectionId, isGame])

  useEffect(() => {
    if (isGame && !gameId && games.length > 0) setGameId(games[0].id)
  }, [isGame, gameId, games])

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

  const activeRows = useMemo(() => matched.filter((r) => !removedLines.has(r.line)), [matched, removedLines])

  const selectedGame = isGame ? games.find((g) => g.id === gameId) : null
  const effectiveCurveId = isGame ? selectedGame?.payout_curve_id ?? '' : curveId
  const selectedCurve = curves.find((c) => c.id === effectiveCurveId)

  const preview = useMemo(() => {
    if (!selectedCurve) return []
    const ranked = rankResultRows(activeRows)
    return ranked.map((r) => ({ ...r, points: curvePoints(r.rank, selectedCurve) }))
  }, [activeRows, selectedCurve])

  function resetForm() {
    setFileName(null)
    setParseResult(null)
    setRemovedLines(new Set())
    setCcidOverrides({})
    setLabel('')
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
    if (!label) setLabel(file.name.replace(/\.csv$/i, ''))
    const reader = new FileReader()
    const parser = isGame ? parseGameCsv : parseWuclapCsv
    reader.onload = () => setParseResult(parser(String(reader.result)))
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
      const resultSet = await createResultSet(sectionId, {
        source,
        gameId: isGame ? gameId : null,
        label: label.trim() || fileName,
        payoutCurveId: effectiveCurveId,
        fileName,
        uploadedBy: uploaderId,
      })
      await insertResultRows(
        resultSet.id,
        preview.map((r) => ({ ccid: r.ccid, student_id: r.student_id, rank: r.rank, raw_score: r.score }))
      )
      const emitted = await postResultSet(resultSet.id)
      setPostSuccess({ label: resultSet.label, emitted })
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
  const canPost = isGame ? !!gameId : !!curveId

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
      <div style={sectionTitleStyle}>{isGame ? 'Upload game close-out results' : 'Upload WuClap results'}</div>

      {isGame && games.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>
          No games scheduled yet — add one on the GAMES tab first.
        </div>
      ) : (
        <>
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
                {parseResult.notices.length > 0 ? `, ${parseResult.notices.length} notice${parseResult.notices.length === 1 ? '' : 's'}` : ''}
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

              {parseResult.notices.length > 0 && (
                <div style={{ color: 'var(--warning)', fontSize: 13 }}>
                  {parseResult.notices.map((n, i) => (
                    <div key={i}>
                      Line {n.line}: {n.message}
                    </div>
                  ))}
                </div>
              )}

              {preview.length > 0 && (
                <>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    {isGame ? (
                      <div>
                        <div style={miniLabelStyle}>Game</div>
                        <select value={gameId} onChange={(e) => setGameId(e.target.value)} style={inputStyle}>
                          {games.map((g) => (
                            <option key={g.id} value={g.id}>
                              MD{g.matchday} — {g.title}
                            </option>
                          ))}
                        </select>
                        {selectedCurve && (
                          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                            curve: {selectedCurve.name}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div style={miniLabelStyle}>Payout curve</div>
                        <select value={curveId} onChange={(e) => setCurveId(e.target.value)} style={inputStyle}>
                          {curves.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                              {c.is_wuclap_default ? ' (default)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={miniLabelStyle}>Label</div>
                      <input value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} />
                    </div>
                  </div>

                  <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                    {matchedCount} matched, {unmatchedCount > 0 ? <span style={{ color: 'var(--warning)' }}>{unmatchedCount} unmatched</span> : '0 unmatched'}
                  </div>

                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>CCID</th>
                        <th style={thStyle}>Name</th>
                        <th style={thStyle}>Score</th>
                        <th style={thStyle}>Rank</th>
                        <th style={thStyle}>Points</th>
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
                            {r.matchedName ?? <span style={{ color: 'var(--warning)' }}>unmatched — {r.displayName}</span>}
                          </td>
                          <td style={tdStyle}>{r.score ?? '—'}</td>
                          <td style={tdStyle}>{r.rank ?? '—'}</td>
                          <td style={tdStyle}>{r.points}</td>
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

                  <button onClick={handlePost} disabled={posting || !canPost || !label.trim()} style={{ ...primaryButtonStyle, alignSelf: 'flex-start' }}>
                    {posting ? 'Posting…' : `Post ${preview.length} row${preview.length === 1 ? '' : 's'}`}
                  </button>
                </>
              )}
            </>
          )}
        </>
      )}

      {postSuccess && (
        <div style={{ color: 'var(--success)', fontSize: 13 }}>
          Posted "{postSuccess.label}" — {postSuccess.emitted} point event{postSuccess.emitted === 1 ? '' : 's'} emitted.
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
