import { describe, expect, it } from 'vitest'
import { plural } from './plural'

describe('plural', () => {
  it('uses the plural for zero', () => {
    expect(plural(0, 'character')).toBe('0 characters')
  })

  it('uses the singular for exactly one', () => {
    expect(plural(1, 'character')).toBe('1 character')
    expect(plural(1, 'vote')).toBe('1 vote')
  })

  it('uses the plural for two or more', () => {
    expect(plural(2, 'character')).toBe('2 characters')
    expect(plural(120, 'vote')).toBe('120 votes')
  })

  it('accepts an irregular plural', () => {
    expect(plural(1, 'person', 'people')).toBe('1 person')
    expect(plural(3, 'person', 'people')).toBe('3 people')
  })
})
