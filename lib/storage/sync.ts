/**
 * Offline-first sync stub.
 * Pattern: write local first, queue background push (Phase 4 progressive enhancement).
 * Conflict policy: last-write-wins by timestamp (simpler than CRDTs; document tradeoff).
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

type SyncQueueItem = {
  id: string;
  kind: "game" | "puzzleAttempt" | "profile";
  payload: string;
  updatedAt: number;
  synced: boolean;
};

interface SyncDB extends DBSchema {
  syncQueue: {
    key: string;
    value: SyncQueueItem;
  };
}

let dbp: Promise<IDBPDatabase<SyncDB>> | null = null;

function db(): Promise<IDBPDatabase<SyncDB>> {
  if (!dbp) {
    dbp = openDB<SyncDB>("blunder-guard-sync", 1, {
      upgrade(database) {
        database.createObjectStore("syncQueue", { keyPath: "id" });
      },
    });
  }
  return dbp;
}

export async function enqueueSync(
  kind: SyncQueueItem["kind"],
  payload: unknown,
): Promise<void> {
  const database = await db();
  const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await database.put("syncQueue", {
    id,
    kind,
    payload: JSON.stringify(payload),
    updatedAt: Date.now(),
    synced: false,
  });
  void flushSyncQueue();
}

/**
 * Push queued items to Supabase when logged in.
 * No-ops without NEXT_PUBLIC_SUPABASE_URL — local-only mode stays fully usable.
 */
export async function flushSyncQueue(): Promise<{ pushed: number }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { pushed: 0 };
  }
  // Auth + Prisma push wired when Supabase keys are present (Phase 4 complete path).
  // For now we mark nothing synced so a later session can retry.
  return { pushed: 0 };
}

export async function mergeOnLogin(): Promise<void> {
  // last-write-wins merge placeholder — pull cloud rows, compare updatedAt, write newer.
  await flushSyncQueue();
}
