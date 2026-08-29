/**
 * Tiny in-memory TTL cache. Used by the trend provider and the YouTube
 * adapter to avoid hammering external services on every request.
 *
 * No external dependencies, no persistence. Trend Scout intentionally uses
 * ephemeral cache + Prisma snapshots for cross-window history.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function cacheInvalidate(key: string): void {
  store.delete(key);
}

export function cacheInvalidatePrefix(prefix: string): void {
  for (const key of Array.from(store.keys())) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Convenience: read-through cache helper. */
export async function cacheReadThrough<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await loader();
  cacheSet(key, value, ttlMs);
  return value;
}

/** Default TTLs (ms). */
export const TTL = {
  TRENDS_RSS: 5 * 60 * 1000, // 5 min — Google Trends RSS updates ~ hourly
  YOUTUBE_SEARCH: 30 * 60 * 1000, // 30 min
  BRIEF: 60 * 60 * 1000, // 1 hour — briefs are deterministic per trend+niche+lang
  INTERNATIONAL: 60 * 60 * 1000, // 1 hour
  RADAR: 5 * 60 * 1000, // 5 min
} as const;
