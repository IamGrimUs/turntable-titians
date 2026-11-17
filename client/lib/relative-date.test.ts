import { describe, expect, it } from 'vitest'
import { formatRelativeDate } from './relative-date'

const now = new Date('2026-11-16T12:00:00.000Z')
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

describe('formatRelativeDate', () => {
  it('says just now under a minute, and for a clock slightly ahead', () => {
    expect(formatRelativeDate(ago(10_000), now)).toBe('just now')
    expect(formatRelativeDate(ago(-5_000), now)).toBe('just now')
  })

  it('uses minutes, hours and days', () => {
    expect(formatRelativeDate(ago(5 * 60_000), now)).toBe('5m ago')
    expect(formatRelativeDate(ago(3 * 3_600_000), now)).toBe('3h ago')
    expect(formatRelativeDate(ago(2 * 86_400_000), now)).toBe('2d ago')
    expect(formatRelativeDate(ago(30 * 86_400_000), now)).toBe('30d ago')
  })

  it('falls back to a plain date after 30 days', () => {
    const iso = ago(45 * 86_400_000)
    expect(formatRelativeDate(iso, now)).toBe(new Date(iso).toLocaleDateString())
  })

  it('returns an empty string for an invalid date', () => {
    expect(formatRelativeDate('not a date', now)).toBe('')
  })
})
