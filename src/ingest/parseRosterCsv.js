// Canvas roster export → { ccid, fullName } pairs for pending_enrollments
// bulk import. Fixture: docs/samples/canvas_roster_sample.csv.
//
// Canvas exports carry two non-student rows after the header: a blank line
// and a "Points Possible" line. Both have an empty SIS Login ID, so that's
// the single gate used to recognize them — anything else with an empty
// SIS Login ID is a genuine anomaly and gets reported, never dropped.

import Papa from 'papaparse'

export function parseRosterCsv(csvText) {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })
  const rows = []
  const errors = []
  const seen = new Map() // ccid -> row index in `rows`

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

    rows.push({ line, ccid, fullName, rawSection: record.Section || '' })
  })

  parsed.errors.forEach((e) => {
    errors.push({ line: e.row != null ? e.row + 2 : null, message: e.message })
  })

  return { rows, errors }
}
