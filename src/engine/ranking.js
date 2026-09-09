// Standard competition ranking (1, 2, 2, 4).
// rows: [{ id, score }] in any order. Returns new rows sorted by score
// descending with `rank` added; ties share a rank, the next rank skips.

export function competitionRanks(rows) {
  const sorted = [...rows].sort((a, b) => b.score - a.score)
  let prevScore = null
  let prevRank = 0
  return sorted.map((row, i) => {
    const rank = row.score === prevScore ? prevRank : i + 1
    prevScore = row.score
    prevRank = rank
    return { ...row, rank }
  })
}
