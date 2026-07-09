/**
 * Puzzle session engine — selection, playback validation, rating updates.
 */
import { Chess, type Square } from "chess.js";
import type { PuzzleRecord } from "./bank";
import { LOCAL_PUZZLES } from "./bank";
import { updatePuzzleRating } from "./rating";
import { getDueReviews, scheduleReview } from "./srs";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

type PuzzleMeta = {
  id: "meta";
  puzzleRating: number;
  dailyGoal: number;
  dailyCount: number;
  dailyDate: string;
  streak: number;
};

type Attempt = {
  id: string;
  puzzleId: string;
  solved: boolean;
  date: number;
  userRatingAfter: number;
};

interface PuzzleProgressDB extends DBSchema {
  puzzleMeta: { key: string; value: PuzzleMeta };
  puzzleAttempts: {
    key: string;
    value: Attempt;
    indexes: { "by-puzzle": string };
  };
}

let dbp: Promise<IDBPDatabase<PuzzleProgressDB>> | null = null;

function progressDb(): Promise<IDBPDatabase<PuzzleProgressDB>> {
  if (!dbp) {
    dbp = openDB<PuzzleProgressDB>("blunder-guard-puzzles", 1, {
      upgrade(database) {
        database.createObjectStore("puzzleMeta", { keyPath: "id" });
        const attempts = database.createObjectStore("puzzleAttempts", {
          keyPath: "id",
        });
        attempts.createIndex("by-puzzle", "puzzleId");
      },
    });
  }
  return dbp;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getPuzzleMeta(): Promise<PuzzleMeta> {
  const db = await progressDb();
  const existing = await db.get("puzzleMeta", "meta");
  if (existing) {
    if (existing.dailyDate !== todayKey()) {
      const streak =
        existing.dailyCount >= existing.dailyGoal
          ? existing.streak + 1
          : 0;
      const next: PuzzleMeta = {
        ...existing,
        dailyCount: 0,
        dailyDate: todayKey(),
        streak: existing.dailyDate === yesterdayKey() ? streak : 0,
      };
      // Don't bump streak on load — only track date rollover of count
      next.streak = existing.streak;
      next.dailyCount = 0;
      next.dailyDate = todayKey();
      await db.put("puzzleMeta", next);
      return next;
    }
    return existing;
  }
  const fresh: PuzzleMeta = {
    id: "meta",
    puzzleRating: 600,
    dailyGoal: 10,
    dailyCount: 0,
    dailyDate: todayKey(),
    streak: 0,
  };
  await db.put("puzzleMeta", fresh);
  return fresh;
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function recordAttempt(
  puzzle: PuzzleRecord,
  solved: boolean,
  practiceMode: boolean,
): Promise<PuzzleMeta> {
  const db = await progressDb();
  const meta = await getPuzzleMeta();
  let rating = meta.puzzleRating;
  if (!practiceMode) {
    rating = updatePuzzleRating(meta.puzzleRating, puzzle.rating, solved);
  }
  const next: PuzzleMeta = {
    ...meta,
    puzzleRating: rating,
    dailyCount: meta.dailyCount + 1,
    dailyDate: todayKey(),
  };
  if (next.dailyCount >= next.dailyGoal && meta.dailyCount < meta.dailyGoal) {
    next.streak = meta.streak + 1;
  }
  await db.put("puzzleMeta", next);
  await db.put("puzzleAttempts", {
    id: `${puzzle.id}-${Date.now()}`,
    puzzleId: puzzle.id,
    solved,
    date: Date.now(),
    userRatingAfter: rating,
  });
  if (!solved) {
    await scheduleReview(puzzle.id, "puzzle", false);
  } else {
    await scheduleReview(puzzle.id, "puzzle", true);
  }
  return next;
}

export async function recentPuzzleIds(limit = 50): Promise<Set<string>> {
  const db = await progressDb();
  const all = await db.getAll("puzzleAttempts");
  return new Set(
    all
      .sort((a, b) => b.date - a.date)
      .slice(0, limit)
      .map((a) => a.puzzleId),
  );
}

export type SelectOptions = {
  puzzles: PuzzleRecord[];
  userRating: number;
  themes?: string[];
  practiceMode?: boolean;
};

export async function selectPuzzle(
  opts: SelectOptions,
): Promise<PuzzleRecord | null> {
  const due = await getDueReviews("puzzle", 5);
  const byId = new Map(opts.puzzles.map((p) => [p.id, p]));
  for (const id of due) {
    const p = byId.get(id);
    if (p) return p;
  }

  const recent = await recentPuzzleIds();
  let window = 100;
  let pool = opts.puzzles.filter((p) => {
    if (recent.has(p.id)) return false;
    if (opts.themes?.length) {
      if (!opts.themes.some((t) => p.themes.includes(t))) return false;
    }
    return Math.abs(p.rating - opts.userRating) <= window;
  });
  while (pool.length === 0 && window < 800) {
    window += 100;
    pool = opts.puzzles.filter((p) => {
      if (opts.themes?.length && !opts.themes.some((t) => p.themes.includes(t))) {
        return false;
      }
      return Math.abs(p.rating - opts.userRating) <= window;
    });
  }
  if (pool.length === 0) pool = [...opts.puzzles];
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

export function getLocalPuzzles(): PuzzleRecord[] {
  return LOCAL_PUZZLES;
}

/**
 * Lichess: FEN is before the opponent's setup move; moves[0] is that setup.
 * Local bank: if the first UCI is already legal for the side to move, there is no setup ply.
 */
export function parsePuzzleLine(puzzle: PuzzleRecord): {
  setupUci: string | null;
  solutionUcis: string[];
} {
  const parts = puzzle.moves.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { setupUci: null, solutionUcis: [] };
  if (parts.length === 1) {
    return { setupUci: null, solutionUcis: parts };
  }

  try {
    const chess = new Chess(puzzle.fen);
    const first = parts[0]!;
    const from = first.slice(0, 2) as Square;
    const piece = chess.get(from);
    if (piece && piece.color === chess.turn()) {
      return { setupUci: null, solutionUcis: parts };
    }
  } catch {
    // fall through to Lichess convention
  }

  return {
    setupUci: parts[0]!,
    solutionUcis: parts.slice(1),
  };
}
