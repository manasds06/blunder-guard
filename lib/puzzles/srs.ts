/**
 * Simplified Leitner spaced repetition.
 * Intervals: 1 → 3 → 7 days. Fail resets to 1 day.
 * See also SM-2 for a more graded alternative.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const INTERVALS_MS = [
  1 * 24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
];

type SrsItem = {
  id: string;
  kind: "puzzle" | "opening";
  intervalIndex: number;
  dueAt: number;
  updatedAt: number;
};

interface SrsDB extends DBSchema {
  srsQueue: {
    key: string;
    value: SrsItem;
    indexes: { "by-due": number };
  };
}

let dbp: Promise<IDBPDatabase<SrsDB>> | null = null;

function db(): Promise<IDBPDatabase<SrsDB>> {
  if (!dbp) {
    dbp = openDB<SrsDB>("blunder-guard-srs", 1, {
      upgrade(database) {
        const store = database.createObjectStore("srsQueue", { keyPath: "id" });
        store.createIndex("by-due", "dueAt");
      },
    });
  }
  return dbp;
}

export async function scheduleReview(
  id: string,
  kind: "puzzle" | "opening",
  solved: boolean,
): Promise<void> {
  const database = await db();
  const existing = await database.get("srsQueue", id);
  let intervalIndex = existing?.intervalIndex ?? 0;
  if (!solved) {
    intervalIndex = 0;
  } else {
    intervalIndex = Math.min(intervalIndex + 1, INTERVALS_MS.length - 1);
    if (!existing) intervalIndex = 0;
  }
  const dueAt = Date.now() + INTERVALS_MS[intervalIndex]!;
  await database.put("srsQueue", {
    id,
    kind,
    intervalIndex,
    dueAt,
    updatedAt: Date.now(),
  });
}

export async function getDueReviews(
  kind: "puzzle" | "opening",
  limit = 5,
): Promise<string[]> {
  const database = await db();
  const all = await database.getAllFromIndex("srsQueue", "by-due");
  const now = Date.now();
  return all
    .filter((i) => i.kind === kind && i.dueAt <= now)
    .slice(0, limit)
    .map((i) => i.id);
}

export async function clearReview(id: string): Promise<void> {
  const database = await db();
  await database.delete("srsQueue", id);
}
