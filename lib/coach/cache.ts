/**
 * Server-side in-memory LRU for coach explanations.
 * Pattern: LRU cache — identical fen+move mistakes are common at ~600 Elo.
 */
type Entry = { text: string; provider: string; at: number };

const MAX = 200;
const map = new Map<string, Entry>();

export function cacheGet(key: string): Entry | undefined {
  const hit = map.get(key);
  if (!hit) return undefined;
  // Refresh recency
  map.delete(key);
  map.set(key, hit);
  return hit;
}

export function cacheSet(key: string, text: string, provider: string): void {
  if (map.has(key)) map.delete(key);
  map.set(key, { text, provider, at: Date.now() });
  while (map.size > MAX) {
    const oldest = map.keys().next().value;
    if (oldest == null) break;
    map.delete(oldest);
  }
}

/** Simple stable hash for cache keys (not cryptographic). */
export async function hashKey(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
  }
  // Fallback
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return `h${Math.abs(h)}`;
}
