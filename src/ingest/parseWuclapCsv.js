// WuClap quiz-results export → { ccid, displayName, score } rows.
// Fixture: docs/samples/wuclap_results_sample.csv.
//
// ccid = the local-part of Email, lowercased — the same derivation used at
// login to link a student's @ualberta.ca account to their roster ccid.
// This is purely mechanical: an alias-format email (e.g.
// first.lastname@ualberta.ca) still produces a row here, just with a ccid
// that won't match any real enrollment. That's a matching-time concern
// (see matchCcids.js), not a parse error.
//
// score = the "Points ??" column (WuClap's own literal, un-renamed header),
// used for ranking. Rank is never assigned here — see src/engine/results.js.
//
// Duplicate ccid (e.g. a double-submission/export artifact): keep the
// higher score. Never let export row order cost a student their
// leaderboard position. Reported as a non-blocking notice, not an error.

import Papa from 'papaparse'

export function parseWuclapCsv(csvText) {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })
  const rows = []
  const errors = []
  const notices = []
  const indexByCcid = new Map()

  parsed.data.forEach((record, i) => {
    const line = i + 2 // +1 for the header row, +1 to make 1-indexed
    const email = (record.Email || '').trim()
    if (!email) return // footer ("Average") / blank rows have no email

    const atIdx = email.indexOf('@')
    if (atIdx <= 0) {
      errors.push({ line, message: `malformed email "${email}"` })
      return
    }
    const ccid = email.slice(0, atIdx).toLowerCase()

    const scoreRaw = (record['Points ??'] || '').trim()
    const score = scoreRaw === '' ? null : Number(scoreRaw)
    if (scoreRaw !== '' && Number.isNaN(score)) {
      errors.push({ line, message: `non-numeric score "${scoreRaw}" for ccid "${ccid}"` })
      return
    }

    const displayName =
      (record.Username || `${record['First name'] || ''} ${record['Last name'] || ''}`).trim()

    if (indexByCcid.has(ccid)) {
      const existingIdx = indexByCcid.get(ccid)
      const existing = rows[existingIdx]
      if ((score ?? -Infinity) > (existing.score ?? -Infinity)) {
        notices.push({
          line,
          message: `duplicate ccid "${ccid}": kept line ${line} (score ${score}) over line ${existing.line} (score ${existing.score})`,
        })
        rows[existingIdx] = { line, ccid, displayName, score }
      } else {
        notices.push({
          line,
          message: `duplicate ccid "${ccid}": kept line ${existing.line} (score ${existing.score}) over line ${line} (score ${score})`,
        })
      }
      return
    }
    indexByCcid.set(ccid, rows.length)
    rows.push({ line, ccid, displayName, score })
  })

  parsed.errors.forEach((e) => {
    errors.push({ line: e.row != null ? e.row + 2 : null, message: e.message })
  })

  return { rows, errors, notices }
}
