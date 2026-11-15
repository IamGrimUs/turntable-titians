import type { PrismaClient } from '@prisma/client'

/**
 * A small fixed-window rate limiter that keeps its counters in Postgres.
 *
 * The sign-in form runs on serverless functions, where every request can land on
 * a fresh instance, so counters kept in memory would never add up. Postgres is
 * already shared by every instance, so it needs no extra service.
 *
 * Each key has one row: a counter and the time its window started. The check is a
 * single atomic statement, so two simultaneous requests can never both slip under
 * the limit. The database clock is used throughout, so instances can't disagree.
 */

export type RateLimitDb = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>

export interface RateLimitOptions {
  key: string
  limit: number
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  count: number
  remaining: number
  retryAfterSeconds: number
}

type Row = { count: number; retryAfterSeconds: number }

/**
 * Keys are HMAC hashes, so the table never holds a plaintext email address or IP.
 * The namespace keeps an email and an IP that happen to look alike from colliding.
 */
export async function hashKey(namespace: string, value: string, secret: string): Promise<string> {
  // Web Crypto, not node:crypto: this file is also pulled into the Edge middleware bundle.
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${namespace}:${value}`))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

const toWait = (seconds: number) => Math.max(0, Math.ceil(Number(seconds) || 0))

/** Counts one attempt, and reports whether it is within the limit. */
export async function consume(
  db: RateLimitDb,
  { key, limit, windowSeconds }: RateLimitOptions,
  deps: { random?: () => number } = {}
): Promise<RateLimitResult> {
  const rows = await db.$queryRaw<Row[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."windowStart" <= NOW() - make_interval(secs => ${windowSeconds}::double precision)
        THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE
        WHEN "RateLimit"."windowStart" <= NOW() - make_interval(secs => ${windowSeconds}::double precision)
        THEN NOW() ELSE "RateLimit"."windowStart" END
    RETURNING
      "count",
      CEIL(EXTRACT(EPOCH FROM ("windowStart" + make_interval(secs => ${windowSeconds}::double precision) - NOW())))::int
        AS "retryAfterSeconds"
  `
  const row = rows[0]
  const count = Number(row?.count ?? 1)
  const allowed = count <= limit

  // Housekeeping: now and then, drop rows that expired long ago. Best effort only.
  if ((deps.random ?? Math.random)() < 0.02) {
    void Promise.resolve(db.$executeRaw`DELETE FROM "RateLimit" WHERE "windowStart" < NOW() - INTERVAL '2 days'`).catch(
      () => {}
    )
  }

  return {
    allowed,
    count,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: allowed ? 0 : toWait(row?.retryAfterSeconds),
  }
}

/** Reports whether the next attempt would be refused, without counting anything. */
export async function peek(db: RateLimitDb, { key, limit, windowSeconds }: RateLimitOptions): Promise<RateLimitResult> {
  const rows = await db.$queryRaw<Row[]>`
    SELECT
      "count",
      CEIL(EXTRACT(EPOCH FROM ("windowStart" + make_interval(secs => ${windowSeconds}::double precision) - NOW())))::int
        AS "retryAfterSeconds"
    FROM "RateLimit"
    WHERE "key" = ${key}
      AND "windowStart" > NOW() - make_interval(secs => ${windowSeconds}::double precision)
  `
  const row = rows[0]
  if (!row) return { allowed: true, count: 0, remaining: limit, retryAfterSeconds: 0 }
  const count = Number(row.count)
  const allowed = count < limit
  return {
    allowed,
    count,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: allowed ? 0 : toWait(row.retryAfterSeconds),
  }
}
