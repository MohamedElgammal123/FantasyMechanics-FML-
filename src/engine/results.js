// Rank assignment for a posted result set — the only place ranks get
// computed; parsers never assign ranks themselves (see src/ingest/).

import { competitionRanks } from './ranking.js'

// rows: [{ id, score }], score may be null (participated, unranked). Only
// scored rows go through competitionRanks; null-score rows pass through
// untouched with rank: null (curvePoints treats null rank as the
// participation floor).
export function rankResultRows(rows) {
  const scored = rows.filter((r) => r.score != null)
  const unscored = rows.filter((r) => r.score == null)
  const ranked = competitionRanks(scored)
  return [...ranked, ...unscored.map((r) => ({ ...r, rank: null }))]
}
