/**
 * Dashboard aggregates from local IndexedDB history.
 * Precompute on read for v1; avoid recomputing on every React render in the UI.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type GameStat = {
  id: string;
  result: string;
  botElo: number;
  blunders: number;
  date: number;
};

export type DashboardData = {
  puzzleRatingHistory: { date: number; rating: number }[];
  blundersPerGame: { date: number; blunders: number }[];
  winRateByElo: { elo: number; wins: number; games: number }[];
  estimatedStrength: number | null;
  themeCounts: Record<string, number>;
  gamesThisWeek: number;
  puzzleStreak: number;
  empty: boolean;
};

interface StatsDB extends DBSchema {
  gameStats: { key: string; value: GameStat };
  puzzleAttempts: {
    key: string;
    value: { id: string; date: number; userRatingAfter: number; solved: boolean };
  };
}

async function openStats(): Promise<IDBPDatabase<StatsDB>> {
  return openDB<StatsDB>("blunder-guard-stats", 1, {
    upgrade(db) {
      db.createObjectStore("gameStats", { keyPath: "id" });
      db.createObjectStore("puzzleAttempts", { keyPath: "id" });
    },
  });
}

export async function recordGameStat(stat: GameStat): Promise<void> {
  const db = await openStats();
  await db.put("gameStats", stat);
}

export async function aggregateDashboard(
  puzzleStreak = 0,
): Promise<DashboardData> {
  const db = await openStats();
  const games = await db.getAll("gameStats");
  const attempts = await db.getAll("puzzleAttempts");

  // Also try puzzle DB from session module store name
  let puzzleHistory: { date: number; rating: number }[] = [];
  try {
    const pdb = await openDB("blunder-guard-puzzles", 1);
    const rows = await pdb.getAll("puzzleAttempts");
    puzzleHistory = rows
      .map((r: { date: number; userRatingAfter: number }) => ({
        date: r.date,
        rating: r.userRatingAfter,
      }))
      .sort((a, b) => a.date - b.date);
  } catch {
    puzzleHistory = attempts
      .map((a) => ({ date: a.date, rating: a.userRatingAfter }))
      .sort((a, b) => a.date - b.date);
  }

  const blundersPerGame = games
    .slice()
    .sort((a, b) => a.date - b.date)
    .map((g) => ({ date: g.date, blunders: g.blunders }));

  const byElo = new Map<number, { wins: number; games: number }>();
  for (const g of games) {
    const cur = byElo.get(g.botElo) ?? { wins: 0, games: 0 };
    cur.games += 1;
    if (g.result === "win" || g.result === "checkmate-win") cur.wins += 1;
    byElo.set(g.botElo, cur);
  }
  const winRateByElo = [...byElo.entries()]
    .map(([elo, v]) => ({ elo, ...v }))
    .sort((a, b) => a.elo - b.elo);

  // Estimated strength = highest Elo with ≥50% over last 10 games at that level
  let estimatedStrength: number | null = null;
  for (const row of [...winRateByElo].reverse()) {
    const recent = games
      .filter((g) => g.botElo === row.elo)
      .sort((a, b) => b.date - a.date)
      .slice(0, 10);
    if (recent.length < 3) continue;
    const wins = recent.filter(
      (g) => g.result === "win" || g.result === "checkmate-win",
    ).length;
    if (wins / recent.length >= 0.5) {
      estimatedStrength = row.elo;
      break;
    }
  }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const gamesThisWeek = games.filter((g) => g.date >= weekAgo).length;

  return {
    puzzleRatingHistory: puzzleHistory,
    blundersPerGame,
    winRateByElo,
    estimatedStrength,
    themeCounts: {},
    gamesThisWeek,
    puzzleStreak,
    empty: games.length < 3 && puzzleHistory.length < 3,
  };
}
