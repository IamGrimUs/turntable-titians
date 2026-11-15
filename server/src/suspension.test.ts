import { describe, it, expect } from 'vitest'
import { isSuspended, cleanSuspension } from './suspension'
import { LIMITS } from './validation'

const now = new Date('2026-11-15T12:00:00.000Z')
const past = new Date('2026-11-14T12:00:00.000Z')
const future = new Date('2026-11-16T12:00:00.000Z')

describe('isSuspended', () => {
  it('is false when suspendedAt is null', () => {
    expect(isSuspended({ suspendedAt: null, suspendedUntil: null }, now)).toBe(false)
  })

  it('is false when suspendedAt is null even if an end date is set', () => {
    expect(isSuspended({ suspendedAt: null, suspendedUntil: future }, now)).toBe(false)
  })

  it('is true with no end date', () => {
    expect(isSuspended({ suspendedAt: past, suspendedUntil: null }, now)).toBe(true)
  })

  it('is true with an end date in the future', () => {
    expect(isSuspended({ suspendedAt: past, suspendedUntil: future }, now)).toBe(true)
  })

  it('is false once the end date has passed (an expired suspension reads as active)', () => {
    expect(isSuspended({ suspendedAt: past, suspendedUntil: past }, now)).toBe(false)
  })

  it('is false when the end date is exactly now', () => {
    expect(isSuspended({ suspendedAt: past, suspendedUntil: new Date(now.getTime()) }, now)).toBe(false)
  })
})

describe('cleanSuspension', () => {
  it('trims the reason', () => {
    expect(cleanSuspension({ reason: '  Spamming entries  ' }, now).reason).toBe('Spamming entries')
  })

  it.each([['empty', ''], ['whitespace only', '   '], ['missing', undefined], ['null', null]])(
    'rejects a %s reason',
    (_label, reason) => {
      expect(() => cleanSuspension({ reason }, now)).toThrow(/required/)
    }
  )

  it('accepts a reason of exactly the limit', () => {
    expect(LIMITS.suspensionReason).toBe(500)
    const reason = 'a'.repeat(500)
    expect(cleanSuspension({ reason }, now).reason).toBe(reason)
  })

  it('rejects a reason one over the limit', () => {
    expect(() => cleanSuspension({ reason: 'a'.repeat(501) }, now)).toThrow(/500 characters or fewer/)
  })

  it('rejects control characters in the reason', () => {
    expect(() => cleanSuspension({ reason: 'bad\u0000' }, now)).toThrow(/aren't allowed/)
  })

  it('throws BAD_USER_INPUT for a bad reason', () => {
    try {
      cleanSuspension({ reason: '' }, now)
      expect.unreachable()
    } catch (e) {
      expect((e as { extensions?: { code?: string } }).extensions?.code).toBe('BAD_USER_INPUT')
    }
  })

  it.each([['undefined', undefined], ['null', null], ['empty string', '']])(
    'returns until null for %s',
    (_label, until) => {
      expect(cleanSuspension({ reason: 'x', until }, now).until).toBeNull()
    }
  )

  it('returns no end date when until is omitted', () => {
    expect(cleanSuspension({ reason: 'x' }, now).until).toBeNull()
  })

  it('returns a Date for a future ISO string', () => {
    const until = cleanSuspension({ reason: 'x', until: '2026-12-01T00:00:00.000Z' }, now).until
    expect(until).toBeInstanceOf(Date)
    expect(until?.toISOString()).toBe('2026-12-01T00:00:00.000Z')
  })

  it('rejects an until that is not a date', () => {
    expect(() => cleanSuspension({ reason: 'x', until: 'not a date' }, now)).toThrow(/valid date/)
  })

  it('rejects an until that is not a string', () => {
    expect(() => cleanSuspension({ reason: 'x', until: 12345 }, now)).toThrow(/valid date/)
  })

  it('rejects an until in the past', () => {
    expect(() => cleanSuspension({ reason: 'x', until: '2026-11-14T12:00:00.000Z' }, now)).toThrow(/in the future/)
  })

  it('rejects an until exactly equal to now', () => {
    expect(() => cleanSuspension({ reason: 'x', until: now.toISOString() }, now)).toThrow(/in the future/)
  })

  it('throws BAD_USER_INPUT for a bad until', () => {
    try {
      cleanSuspension({ reason: 'x', until: 'not a date' }, now)
      expect.unreachable()
    } catch (e) {
      expect((e as { extensions?: { code?: string } }).extensions?.code).toBe('BAD_USER_INPUT')
    }
  })
})
