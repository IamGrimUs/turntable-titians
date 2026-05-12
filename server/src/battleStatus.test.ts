import { describe, it, expect } from 'vitest'
import { computeBattleStatus } from './battleStatus'

function d(dateStr: string) {
  return new Date(dateStr)
}

describe('computeBattleStatus', () => {
  it('returns UPCOMING when today is before startDate', () => {
    const result = computeBattleStatus(d('2025-06-01'), d('2025-06-10'), d('2025-05-31'))
    expect(result).toBe('UPCOMING')
  })

  it('returns ACTIVE when today equals startDate', () => {
    const result = computeBattleStatus(d('2025-06-01'), d('2025-06-10'), d('2025-06-01'))
    expect(result).toBe('ACTIVE')
  })

  it('returns ACTIVE when today equals endDate (battle closes today)', () => {
    const result = computeBattleStatus(d('2025-06-01'), d('2025-06-10'), d('2025-06-10'))
    expect(result).toBe('ACTIVE')
  })

  it('returns COMPLETED when today is after endDate', () => {
    const result = computeBattleStatus(d('2025-06-01'), d('2025-06-10'), d('2025-06-11'))
    expect(result).toBe('COMPLETED')
  })
})
