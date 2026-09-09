// Canvas gradebook export → { ccid, fullName, finalGrade, letterGrade }
// rows for gradebook_rows (data model §9). Fixture: docs/samples/gradebook_sample.csv.
//
// Same export family as parseRosterCsv.js — a blank row and a
// "Points Possible" row follow the header, both recognized by an empty
// SIS Login ID (the same gate parseRosterCsv uses). A duplicate ccid is
// treated as a data problem, not an export artifact (unlike WuClap's
// keep-best dedup): both offending rows are dropped and reported, forcing
// the instructor to resolve it in the source file, mirroring
// parseRosterCsv's duplicate handling.
//
// Final Score may be blank (student not yet graded, e.g. an incomplete) —
// that's a legitimate null, not an error. Final Grade (letter) is optional
// and carried through verbatim when present.

import Papa from 'papaparse'

export function parseGradebookCsv(csvText) {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })
  const rows = []
  const errors = []
  const seen = new Map() // ccid -> line

  parsed.data.forEach((record, i) => {
    const line = i + 2 // +1 for the header row, +1 for 1-indexing
    const student = (record.Student || '').trim()
    const ccidRaw = (record['SIS Login ID'] || '').trim()

    if (!student && !ccidRaw) return // fully blank row
    if (/^points possible$/i.test(student)) return // Canvas marker row

    if (!ccidRaw) {
      errors.push({ line, message: `missing SIS Login ID for "${student || '(blank name)'}"` })
      return
    }
    if (!student) {
      errors.push({ line, message: `missing Student name for ccid "${ccidRaw}"` })
      return
    }

    const commaIdx = student.indexOf(',')
    const fullName =
      commaIdx === -1 ? student : `${student.slice(commaIdx + 1).trim()} ${student.slice(0, commaIdx).trim()}`
    const ccid = ccidRaw.toLowerCase()

    const scoreRaw = (record['Final Score'] || '').trim()
    const finalGrade = scoreRaw === '' ? null : Number(scoreRaw)
    if (scoreRaw !== '' && Number.isNaN(finalGrade)) {
      errors.push({ line, message: `non-numeric Final Score "${scoreRaw}" for ccid "${ccid}"` })
      return
    }

    const letterGrade = (record['Final Grade'] || '').trim() || null

    if (seen.has(ccid)) {
      errors.push({ line, message: `duplicate ccid "${ccid}" (also line ${seen.get(ccid)})` })
      const dupeIdx = rows.findIndex((r) => r.ccid === ccid)
      if (dupeIdx !== -1) {
        errors.push({ line: rows[dupeIdx].line, message: `duplicate ccid "${ccid}" (also line ${line})` })
        rows.splice(dupeIdx, 1)
      }
      return
    }
    seen.set(ccid, line)

    rows.push({ line, ccid, fullName, finalGrade, letterGrade })
  })

  parsed.errors.forEach((e) => {
    errors.push({ line: e.row != null ? e.row + 2 : null, message: e.message })
  })

  return { rows, errors }
}
