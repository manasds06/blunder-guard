/**
 * Maps target Elo → Stockfish strength knobs.
 *
 * Why two regimes:
 * - 1320–2000: Stockfish's native UCI_LimitStrength + UCI_Elo.
 * - 400–1300: Stockfish can't go that low natively. We combine Skill Level +
 *   MultiPV top-N weighted random pick + tiny movetime so the bot misses tactics
 *   like a human instead of playing "weird random" low-skill Stockfish.
 */

export type BotLevel = {
  elo: number;
  /** UCI Skill Level (0–20); used for sub-1320 */
  skillLevel: number;
  /** Pick randomly from top N MultiPV lines (weighted); 1 = always best */
  pickFromTop: number;
  movetime: number;
  /** Use UCI_LimitStrength path instead of Skill Level */
  limitStrength: boolean;
};

const LOW_LEVELS: BotLevel[] = [
  { elo: 400, skillLevel: 0, pickFromTop: 5, movetime: 40, limitStrength: false },
  { elo: 600, skillLevel: 1, pickFromTop: 4, movetime: 60, limitStrength: false },
  { elo: 800, skillLevel: 3, pickFromTop: 3, movetime: 80, limitStrength: false },
  { elo: 1000, skillLevel: 5, pickFromTop: 2, movetime: 120, limitStrength: false },
  { elo: 1200, skillLevel: 7, pickFromTop: 2, movetime: 200, limitStrength: false },
];

const HIGH_ELOS = [1400, 1600, 1800, 2000] as const;

export const BOT_ELOS: number[] = [
  ...LOW_LEVELS.map((l) => l.elo),
  ...HIGH_ELOS,
];

export function getBotLevel(elo: number): BotLevel {
  const low = LOW_LEVELS.find((l) => l.elo === elo);
  if (low) return low;

  // Clamp high Elo into Stockfish's LimitStrength range (≈1320–3190)
  const clamped = Math.max(1320, Math.min(2000, elo));
  return {
    elo: clamped,
    skillLevel: 20,
    pickFromTop: 1,
    movetime: 800,
    limitStrength: true,
  };
}

/**
 * Weighted random among the first `n` MultiPV lines.
 * Pattern: geometric weights so the best move is most likely but not guaranteed —
 * mimics human "usually find the good move, sometimes don't."
 */
export function pickWeightedIndex(n: number): number {
  if (n <= 1) return 0;
  const weights: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.pow(0.55, i);
    weights.push(w);
    total += w;
  }
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return i;
  }
  return 0;
}
