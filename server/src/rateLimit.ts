/**
 * A small in-memory fixed-window rate limiter.
 *
 * The API runs as one long-lived process, so a Map is enough here. (The sign-in
 * limiter on the client uses Postgres instead, because serverless instances
 * don't share memory.) The Map is capped so an attacker rotating through
 * addresses can't make it eat all the memory.
 */

export interface LimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
  maxKeys?: number;
}

export interface LimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function createLimiter({ limit, windowMs, now = Date.now, maxKeys = 50_000 }: LimiterOptions) {
  const windows = new Map<string, { count: number; start: number }>();

  function makeRoom(t: number) {
    for (const [key, w] of windows) {
      if (t - w.start >= windowMs) windows.delete(key);
    }
    // Still full: drop the oldest entries (Maps iterate in insertion order).
    while (windows.size >= maxKeys) {
      const oldest = windows.keys().next().value;
      if (oldest === undefined) break;
      windows.delete(oldest);
    }
  }

  return {
    hit(key: string): LimitResult {
      const t = now();
      const w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        if (!w && windows.size >= maxKeys) makeRoom(t);
        windows.set(key, { count: 1, start: t });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      w.count += 1;
      if (w.count <= limit) return { allowed: true, retryAfterSeconds: 0 };
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((w.start + windowMs - t) / 1000)) };
    },
    size: () => windows.size,
  };
}
