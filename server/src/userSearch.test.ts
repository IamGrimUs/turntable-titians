import { describe, expect, it } from 'vitest'
import { cleanSearchText, SEARCH_LIMITS } from './userSearch'

describe('SEARCH_LIMITS', () => {
  it('asks for two characters and returns at most eight people', () => {
    expect(SEARCH_LIMITS).toEqual({ minChars: 2, maxResults: 8 })
  })
})

describe('cleanSearchText', () => {
  it('trims and keeps case', () => {
    expect(cleanSearchText('  Skratch ')).toBe('Skratch')
  })

  it('drops one leading @', () => {
    expect(cleanSearchText('@sk')).toBe('sk')
    expect(cleanSearchText('@@sk')).toBeNull()
  })

  it('returns null when too short or empty', () => {
    expect(cleanSearchText('s')).toBeNull()
    expect(cleanSearchText('')).toBeNull()
    expect(cleanSearchText('   ')).toBeNull()
    expect(cleanSearchText('@s')).toBeNull()
  })

  it('returns null for non-strings', () => {
    expect(cleanSearchText(undefined)).toBeNull()
    expect(cleanSearchText(null)).toBeNull()
    expect(cleanSearchText(42)).toBeNull()
  })

  it('returns null for characters a username cannot hold', () => {
    expect(cleanSearchText('50%')).toBeNull()
    expect(cleanSearchText('dj foo')).toBeNull()
    expect(cleanSearchText('sk\u0000')).toBeNull()
    expect(cleanSearchText('ska😀')).toBeNull()
  })

  it('allows every character a username may use', () => {
    expect(cleanSearchText('dj_foo-1.2')).toBe('dj_foo-1.2')
  })

  it('returns null when longer than any username', () => {
    expect(cleanSearchText('a'.repeat(30))).toBe('a'.repeat(30))
    expect(cleanSearchText('a'.repeat(31))).toBeNull()
  })
})
