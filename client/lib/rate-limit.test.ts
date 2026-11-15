import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { consume, peek, hashKey, type RateLimitDb } from './rate-limit'

const queryRaw = vi.fn()
const executeRaw = vi.fn()
const db = { $queryRaw: queryRaw, $executeRaw: executeRaw } as unknown as RateLimitDb

const opts = { key: 'k', limit: 5, windowSeconds: 3600 }

beforeEach(() => {
  queryRaw.mockReset()
  executeRaw.mockReset()
  executeRaw.mockResolvedValue(0)
})

describe('hashKey', () => {
  it('is a stable 64-char hex digest', async () => {
    const a = await hashKey('email', 'person@example.com', 'secret')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashKey('email', 'person@example.com', 'secret')).toBe(a)
  })

  it('differs by namespace, value and secret, so an email and an IP can never collide', async () => {
    const base = await hashKey('email', 'x', 'secret')
    expect(await hashKey('ip', 'x', 'secret')).not.toBe(base)
    expect(await hashKey('email', 'y', 'secret')).not.toBe(base)
    expect(await hashKey('email', 'x', 'other')).not.toBe(base)
  })

  it('never contains the raw value (so the table holds no plaintext emails or IPs)', async () => {
    expect(await hashKey('email', 'person@example.com', 's')).not.toContain('person')
  })

  it('is identical to a standard HMAC-SHA256, so counters written by older versions still match', async () => {
    const expected = createHmac('sha256', 'secret').update('email:person@example.com').digest('hex')
    expect(await hashKey('email', 'person@example.com', 'secret')).toBe(expected)
  })
})

describe('consume', () => {
  it('allows while the count is at or below the limit and reports what is left', async () => {
    queryRaw.mockResolvedValue([{ count: 5, retryAfterSeconds: 3000 }])
    expect(await consume(db, opts, { random: () => 1 })).toEqual({
      allowed: true,
      count: 5,
      remaining: 0,
      retryAfterSeconds: 0,
    })
  })

  it('blocks once the limit is exceeded and says how long to wait', async () => {
    queryRaw.mockResolvedValue([{ count: 6, retryAfterSeconds: 1234 }])
    expect(await consume(db, opts, { random: () => 1 })).toEqual({
      allowed: false,
      count: 6,
      remaining: 0,
      retryAfterSeconds: 1234,
    })
  })

  it('never reports a negative or fractional wait', async () => {
    queryRaw.mockResolvedValue([{ count: 9, retryAfterSeconds: -4 }])
    expect((await consume(db, opts, { random: () => 1 })).retryAfterSeconds).toBe(0)
    queryRaw.mockResolvedValue([{ count: 9, retryAfterSeconds: 12.6 }])
    expect((await consume(db, opts, { random: () => 1 })).retryAfterSeconds).toBe(13)
  })

  it('passes the key and window to the database as bound parameters, not spliced into the SQL', async () => {
    queryRaw.mockResolvedValue([{ count: 1, retryAfterSeconds: 3600 }])
    await consume(db, { key: "evil'; DROP TABLE x; --", limit: 5, windowSeconds: 60 }, { random: () => 1 })
    const [strings, ...values] = queryRaw.mock.calls[0]
    expect(strings.join('')).not.toContain('DROP TABLE')
    expect(values).toContain("evil'; DROP TABLE x; --")
    expect(values).toContain(60)
  })

  it('occasionally removes long-expired rows, and a cleanup failure never breaks the check', async () => {
    queryRaw.mockResolvedValue([{ count: 1, retryAfterSeconds: 3600 }])
    await consume(db, opts, { random: () => 0 })
    expect(executeRaw).toHaveBeenCalledTimes(1)

    executeRaw.mockReset()
    await consume(db, opts, { random: () => 0.99 })
    expect(executeRaw).not.toHaveBeenCalled()

    executeRaw.mockRejectedValue(new Error('cleanup failed'))
    await expect(consume(db, opts, { random: () => 0 })).resolves.toMatchObject({ allowed: true })
  })

  it('lets database errors propagate so the caller can decide to fail open', async () => {
    queryRaw.mockRejectedValue(new Error('relation "RateLimit" does not exist'))
    await expect(consume(db, opts, { random: () => 1 })).rejects.toThrow(/RateLimit/)
  })
})

describe('peek', () => {
  it('is allowed when there is no record yet or the window has passed', async () => {
    queryRaw.mockResolvedValue([])
    expect(await peek(db, opts)).toMatchObject({ allowed: true, count: 0 })
  })

  it('blocks once the limit has been reached (the next attempt would exceed it)', async () => {
    queryRaw.mockResolvedValue([{ count: 5, retryAfterSeconds: 900 }])
    expect(await peek(db, opts)).toMatchObject({ allowed: false, retryAfterSeconds: 900 })
  })

  it('allows while under the limit', async () => {
    queryRaw.mockResolvedValue([{ count: 4, retryAfterSeconds: 900 }])
    expect(await peek(db, opts)).toMatchObject({ allowed: true, count: 4 })
  })

  it('does not write anything', async () => {
    queryRaw.mockResolvedValue([])
    await peek(db, opts)
    expect(executeRaw).not.toHaveBeenCalled()
  })
})
