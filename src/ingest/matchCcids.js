// Matches parsed rows against a section's enrollments, normalizing both
// sides (lowercase/trim) before comparing. Unmatched is a legitimate
// outcome — an alias-format email whose derived ccid isn't a real CCID
// lands here honestly, not as an error or a dropped row. The validation
// UI resolves it (fix ccid / skip row).

export function matchCcids(rows, enrollments) {
  const byCcid = new Map(enrollments.map((e) => [e.ccid.trim().toLowerCase(), e]))
  return rows.map((row) => {
    const ccid = row.ccid.trim().toLowerCase()
    const enrollment = byCcid.get(ccid)
    return {
      ...row,
      ccid,
      student_id: enrollment ? enrollment.student_id : null,
      matchedName: enrollment ? enrollment.fullName : null,
    }
  })
}
