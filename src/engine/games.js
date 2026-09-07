// Game status derivation — pure function over timestamps + result-set
// existence. No stored status column (data model §3): upcoming/open/closed
// derived on read from opens_at/closes_at + whether a POSTED result set
// exists for the game (a merely-parsed or voided set does not count as
// scored — see data model §4, result_sets.status).

export function gameStatus(game, now, hasPostedResults) {
  const opensAt = new Date(game.opens_at).getTime()
  const closesAt = new Date(game.closes_at).getTime()
  const t = new Date(now).getTime()
  if (t < opensAt) return 'upcoming'
  if (t < closesAt) return 'open'
  return hasPostedResults ? 'closed_scored' : 'closed_awaiting'
}
