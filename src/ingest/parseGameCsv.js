// Game close-out export → { ccid, displayName, score } rows.
// Fixture: docs/samples/game_results_sample.csv.
//
// Contract (docs/fml_data_model.md §4): header row `ccid,score`, one row per
// player, higher score = better, no blank/footer rows (Ahmed controls both
// ends of this format, unlike the WuClap export). No display-name column,
// so displayName echoes the raw ccid — it only surfaces in the preview UI
// for an unmatched row.
//
// Same shape and rules as parseWuclapCsv.js for consistency: duplicate ccid
// keeps the higher score (reported as a notice, never an error); a blank
// score is a legitimate "participated, unranked" row (null, not an error);
// a non-numeric score or missing ccid is reported and the row dropped.

import Papa from 'papaparse'

export function parseGameCsv(csvText) {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })
  const rows = []
  const errors = []
  const notices = []
  const indexByCcid = new Map()

  parsed.data.forEach((record, i) => {
    const line = i + 2 // +1 for the header row, +1 to make 1-indexed

    const ccid = (record.ccid || '').trim().toLowerCase()
    if (!ccid) {
      errors.push({ line, message: 'missing ccid' })
      return
    }

    const scoreRaw = (record.score || '').trim()
    const score = scoreRaw === '' ? null : Number(scoreRaw)
    if (scoreRaw !== '' && Number.isNaN(score)) {
      errors.push({ line, message: `non-numeric score "${scoreRaw}" for ccid "${ccid}"` })
      return
    }

    if (indexByCcid.has(ccid)) {
      const existingIdx = indexByCcid.get(ccid)
      const existing = rows[existingIdx]
      if ((score ?? -Infinity) > (existing.score ?? -Infinity)) {
        notices.push({
          line,
          message: `duplicate ccid "${ccid}": kept line ${line} (score ${score}) over line ${existing.line} (score ${existing.score})`,
        })
        rows[existingIdx] = { line, ccid, displayName: ccid, score }
      } else {
        notices.push({
          line,
          message: `duplicate ccid "${ccid}": kept line ${existing.line} (score ${existing.score}) over line ${line} (score ${score})`,
        })
      }
      return
    }
    indexByCcid.set(ccid, rows.length)
    rows.push({ line, ccid, displayName: ccid, score })
  })

  parsed.errors.forEach((e) => {
    errors.push({ line: e.row != null ? e.row + 2 : null, message: e.message })
  })

  return { rows, errors, notices }
}
