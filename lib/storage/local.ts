/**
 * IndexedDB local storage via `idb`.
 * Pattern: Repository — hide IDB details behind typed helpers so Phase 4 can
 * swap/sync to Supabase without rewriting callers.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type SavedGame = {
  id: string;
  fen: string;
  pgn: string;
  history: string[]; // SAN moves
  playerColor: "w" | "b";
  botElo: number;
  hintsUsed: number;
  updatedAt: number;
  result?: string;
};

export type AppSettings = {
  blunderCheckMode: boolean;
  /** claude | gemini | ollama — or omit cloud keys / use ollama for local */
  llmProvider: "claude" | "gemini" | "ollama";
  llmModel?: string;
};

interface BlunderGuardDB extends DBSchema {
  games: {
    key: string;
    value: SavedGame;
    indexes: { "by-updated": number };
  };
  settings: {
    key: string;
    value: AppSettings & { id: string };
  };
  explanationCache: {
    key: string;
    value: { key: string; text: string; createdAt: number };
  };
  puzzleAttempts: {
    key: string;
    value: {
      id: string;
      puzzleId: string;
      solved: boolean;
      date: number;
      userRatingAfter: number;
    };
    indexes: { "by-puzzle": string; "by-date": number };
  };
  puzzleMeta: {
    key: string;
    value: {
      id: string;
      puzzleRating: number;
      dailyGoal: number;
      dailyCount: number;
      dailyDate: string;
      streak: number;
    };
  };
  srsQueue: {
    key: string;
    value: {
      id: string; // puzzleId or opening line id
      kind: "puzzle" | "opening";
      intervalIndex: number;
      dueAt: number;
      updatedAt: number;
    };
    indexes: { "by-due": number };
  };
}

const DB_NAME = "blunder-guard";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<BlunderGuardDB>> | null = null;

function getDb(): Promise<IDBPDatabase<BlunderGuardDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BlunderGuardDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const games = db.createObjectStore("games", { keyPath: "id" });
        games.createIndex("by-updated", "updatedAt");
        db.createObjectStore("settings", { keyPath: "id" });
        db.createObjectStore("explanationCache", { keyPath: "key" });
        const attempts = db.createObjectStore("puzzleAttempts", {
          keyPath: "id",
        });
        attempts.createIndex("by-puzzle", "puzzleId");
        attempts.createIndex("by-date", "date");
        db.createObjectStore("puzzleMeta", { keyPath: "id" });
        const srs = db.createObjectStore("srsQueue", { keyPath: "id" });
        srs.createIndex("by-due", "dueAt");
      },
    });
  }
  return dbPromise;
}

export const CURRENT_GAME_ID = "current";

export async function saveCurrentGame(
  game: Omit<SavedGame, "id" | "updatedAt"> & { id?: string },
): Promise<void> {
  const db = await getDb();
  await db.put("games", {
    ...game,
    id: game.id ?? CURRENT_GAME_ID,
    updatedAt: Date.now(),
  });
}

export async function loadCurrentGame(): Promise<SavedGame | undefined> {
  const db = await getDb();
  return db.get("games", CURRENT_GAME_ID);
}

export async function clearCurrentGame(): Promise<void> {
  const db = await getDb();
  await db.delete("games", CURRENT_GAME_ID);
}

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDb();
  const row = await db.get("settings", "app");
  return (
    row ?? {
      blunderCheckMode: true,
      llmProvider: "ollama",
    }
  );
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDb();
  await db.put("settings", { ...settings, id: "app" });
}

export async function getCachedExplanation(
  key: string,
): Promise<string | undefined> {
  const db = await getDb();
  return (await db.get("explanationCache", key))?.text;
}

export async function setCachedExplanation(
  key: string,
  text: string,
): Promise<void> {
  const db = await getDb();
  await db.put("explanationCache", { key, text, createdAt: Date.now() });
}
