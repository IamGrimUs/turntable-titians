import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  SIGNIN_LIMITS,
  RateLimitError,
  checkSignIn,
  clientIp,
  findRateLimitError,
  normalizeEmailForLimit,
  rateLimitMessage,
} from './signin-limits'
import type { RateLimitDb } from './rate-limit'

const queryRaw = vi.fn()
const executeRaw = vi.fn()
const db = { $queryRaw: queryRaw, $executeRaw: executeRaw } as unknown as RateLimitDb

const ok = (count: number) => ({ count, retryAfterSeconds: 3000 })
const secret = { secret: 'test-secret' }

beforeEach(() => {
  queryRaw.mockReset()
  executeRaw.mockReset()
  executeRaw.mockResolvedValue(0)
})

describe('normalizeEmailForLimit', () => {
  it('lower-cases and trims', () => {
    expect(normalizeEmailForLimit('  Person@Example.COM ')).toBe('person@example.com')
  })

  it('drops +tags so alice+1@x.com and alice+2@x.com share one limit', () => {
    expect(normalizeEmailForLimit('alice+1@example.com')).toBe('alice@example.com')
    expect(normalizeEmailForLimit('alice+anything+else@example.com')).toBe('alice@example.com')
  })

  it('ignores dots for Gmail, which treats them as the same inbox, but not for other providers', () => {
    expect(normalizeEmailForLimit('a.l.i.c.e@gmail.com')).toBe('alice@gmail.com')
    expect(normalizeEmailForLimit('a.l.i.c.e@googlemail.com')).toBe('alice@gmail.com')
    expect(normalizeEmailForLimit('a.lice@example.com')).toBe('a.lice@example.com')
  })

  it('copes with input that is not an email', () => {
    expect(normalizeEmailForLimit('Not An Email')).toBe('not an email')
    expect(normalizeEmailForLimit('')).toBe('')
  })
})

describe('clientIp', () => {
  it('uses the first address in x-forwarded-for', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': ' 203.0.113.5 , 10.0.0.1' }))).toBe('203.0.113.5')
  })

  it('falls back to x-real-ip, then null', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7')
    expect(clientIp(new Headers())).toBeNull()
  })
})

describe('checkSignIn (consume)', () => {
  const input = { email: 'person@example.com', ip: '203.0.113.5', mode: 'consume' as const }

  it('allows when both the IP and the email are under their limits', async () => {
    queryRaw.mockResolvedValueOnce([ok(1)]).mockResolvedValueOnce([ok(1)])
    expect(await checkSignIn(db, input, secret)).toEqual({ allowed: true })
    expect(queryRaw).toHaveBeenCalledTimes(2)
  })

  it('blocks when the email has had too many, with the time to wait', async () => {
    queryRaw
      .mockResolvedValueOnce([ok(1)])
      .mockResolvedValueOnce([{ count: SIGNIN_LIMITS.email.limit + 1, retryAfterSeconds: 700 }])
    expect(await checkSignIn(db, input, secret)).toEqual({ allowed: false, reason: 'email', retryAfterSeconds: 700 })
  })

  it('blocks when the IP has had too many, and then does not spend the email\'s allowance', async () => {
    queryRaw.mockResolvedValueOnce([{ count: SIGNIN_LIMITS.ip.limit + 1, retryAfterSeconds: 400 }])
    expect(await checkSignIn(db, input, secret)).toEqual({ allowed: false, reason: 'ip', retryAfterSeconds: 400 })
    expect(queryRaw).toHaveBeenCalledTimes(1)
  })

  it('only limits by email when the IP is unknown (it cannot attribute an address it cannot see)', async () => {
    queryRaw.mockResolvedValueOnce([ok(1)])
    expect(await checkSignIn(db, { ...input, ip: null }, secret)).toEqual({ allowed: true })
    expect(queryRaw).toHaveBeenCalledTimes(1)
  })

  it('stores only hashes: neither the email nor the IP reaches the database in plaintext', async () => {
    queryRaw.mockResolvedValue([ok(1)])
    await checkSignIn(db, input, secret)
    const everything = JSON.stringify(queryRaw.mock.calls.map(([, ...values]) => values))
    expect(everything).not.toContain('person@example.com')
    expect(everything).not.toContain('203.0.113.5')
  })

  it('treats +tag and Gmail-dot variants of one address as the same address', async () => {
    queryRaw.mockResolvedValue([ok(1)])
    await checkSignIn(db, { ...input, email: 'a.lice+1@gmail.com', ip: null }, secret)
    await checkSignIn(db, { ...input, email: 'alice+2@gmail.com', ip: null }, secret)
    expect(queryRaw.mock.calls[0][1]).toBe(queryRaw.mock.calls[1][1])
  })
})

describe('checkSignIn (peek)', () => {
  const input = { email: 'person@example.com', ip: '203.0.113.5', mode: 'peek' as const }

  it('reports blocked without counting anything', async () => {
    queryRaw.mockResolvedValue([{ count: 99, retryAfterSeconds: 120 }])
    const result = await checkSignIn(db, input, secret)
    expect(result).toMatchObject({ allowed: false, retryAfterSeconds: 120 })
    expect(executeRaw).not.toHaveBeenCalled()
  })

  it('allows when there is nothing recorded', async () => {
    queryRaw.mockResolvedValue([])
    expect(await checkSignIn(db, input, secret)).toEqual({ allowed: true })
  })
})

describe('checkSignIn when the limiter itself fails', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errorSpy.mockRestore())

  it('fails open and logs, so a missing table or database blip can never lock everyone out of signing in', async () => {
    queryRaw.mockRejectedValue(new Error('relation "RateLimit" does not exist'))
    const result = await checkSignIn(db, { email: 'a@b.co', ip: '1.2.3.4', mode: 'consume' }, secret)
    expect(result).toEqual({ allowed: true })
    expect(errorSpy.mock.calls.flat().join(' ')).toMatch(/rate limit/i)
  })
})

describe('RateLimitError and messages', () => {
  it('carries the wait time and has a stable marker', () => {
    const e = new RateLimitError(600)
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('RateLimitError')
    expect(e.retryAfterSeconds).toBe(600)
  })

  it('findRateLimitError finds it inside the wrapping Auth.js puts around thrown errors', () => {
    const inner = new RateLimitError(60)
    const wrapped = new Error('outer', { cause: { err: new Error('middle', { cause: { err: inner } }) } })
    expect(findRateLimitError(wrapped)).toBe(inner)
    expect(findRateLimitError(new Error('unrelated'))).toBeNull()
    expect(findRateLimitError(null)).toBeNull()
  })

  it('turns the wait into plain language', () => {
    expect(rateLimitMessage(30)).toMatch(/less than a minute|few seconds|a minute/i)
    expect(rateLimitMessage(600)).toMatch(/10 minutes/)
    expect(rateLimitMessage(3600)).toMatch(/hour|60 minutes/)
  })
})
