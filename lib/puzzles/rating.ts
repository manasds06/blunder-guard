/**
 * Puzzle Elo rating update.
 * Formula: newR = R + K * (score - expected)
 * expected = 1 / (1 + 10^((puzzleR - userR) / 400))
 * Classic Elo — same math Chess.com/Lichess use for puzzle ratings (simplified K=32).
 */
export function expectedScore(userRating: number, puzzleRating: number): number {
  return 1 / (1 + Math.pow(10, (puzzleRating - userRating) / 400));
}

export function updatePuzzleRating(
  userRating: number,
  puzzleRating: number,
  solved: boolean,
  k = 32,
): number {
  const expected = expectedScore(userRating, puzzleRating);
  const score = solved ? 1 : 0;
  return Math.round(userRating + k * (score - expected));
}
