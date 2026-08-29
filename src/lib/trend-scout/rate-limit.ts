/**
 * Lightweight per-process rate limiter for outbound calls to Google Trends
 * and YouTube. Protects against accidental burst loops.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillPerSec: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimitAllow(key: string): { ok: boolean; remaining: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = {
      tokens: 6,
      lastRefill: now,
      capacity: 6,
      refillPerSec: 1,
    };
    buckets.set(key, b);
  }
  // refill
  const elapsedSec = (now - b.lastRefill) / 1000;
  b.tokens = Math.min(b.capacity, b.tokens + elapsedSec * b.refillPerSec);
  b.lastRefill = now;

  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true, remaining: Math.floor(b.tokens) };
  }
  return { ok: false, remaining: 0 };
}

/** Sleep helper for graceful backoff. */
export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/** Wrap a network call with rate limit + simple retry. */
export async function withRateLimit<T>(
  key: string,
  maxAttempts: number,
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string; attempts: number }> {
  let lastErr = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const gate = rateLimitAllow(key);
    if (!gate.ok) {
      await sleep(800);
      continue;
    }
    try {
      const value = await fn();
      return { ok: true, value };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      // small backoff
      await sleep(400 * attempt);
    }
  }
  return { ok: false, error: lastErr, attempts: maxAttempts };
}
