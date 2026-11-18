import { describe, expect, it } from 'vitest'
import { formatUtcShortDate } from './display-format'

describe('formatUtcShortDate', () => {
  it('reads the date part in UTC, whatever the viewer timezone is', () => {
    // 00:00 UTC is still the day before in New York and Los Angeles: the output must stay Nov 20.
    expect(formatUtcShortDate('2026-11-20T00:00:00.000Z')).toBe('Nov 20')
    expect(formatUtcShortDate('2026-11-20T23:59:59.000Z')).toBe('Nov 20')
    expect(formatUtcShortDate('2026-01-05T00:00:00.000Z')).toBe('Jan 5')
  })
})
