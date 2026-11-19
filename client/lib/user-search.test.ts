import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SEARCH_LIMITS,
  createLatestGate,
  isSearchable,
  moveActive,
  resultsAnnouncement,
  searchText,
  searchViewState,
  type UserSearchResult,
} from './user-search'

const SERVER_USER_SEARCH = fileURLToPath(new URL('../../server/src/userSearch.ts', import.meta.url))
const SERVER_VALIDATION = fileURLToPath(new URL('../../server/src/validation.ts', import.meta.url))

const dj: UserSearchResult = { id: '1', username: 'skratch', image: null, crew: null }

describe('searchText', () => {
  it('drops control characters and one leading @, and trims', () => {
    expect(searchText('  @sk\u0000 ')).toBe('sk')
  })

  it('drops only one leading @', () => {
    expect(searchText('@@sk')).toBe('@sk')
  })

  it('caps the length at maxChars', () => {
    expect(searchText('a'.repeat(40))).toBe('a'.repeat(30))
  })

  it('returns an empty string for blank input', () => {
    expect(searchText('   ')).toBe('')
  })
})

describe('isSearchable', () => {
  it('needs at least minChars characters', () => {
    expect(isSearchable('s')).toBe(false)
    expect(isSearchable('')).toBe(false)
    expect(isSearchable('sk')).toBe(true)
  })
})

describe('searchViewState', () => {
  const base = { text: 'sk', loading: false, failed: false, results: [] as UserSearchResult[] }

  it('is idle when the text is not searchable, even while loading', () => {
    expect(searchViewState({ ...base, text: 's', loading: true })).toBe('idle')
    expect(searchViewState({ ...base, text: '', failed: true, results: [dj] })).toBe('idle')
  })

  it('is loading before error, empty or results', () => {
    expect(searchViewState({ ...base, loading: true, failed: true, results: [dj] })).toBe('loading')
  })

  it('is error before empty or results', () => {
    expect(searchViewState({ ...base, failed: true, results: [dj] })).toBe('error')
  })

  it('is empty with no results and results otherwise', () => {
    expect(searchViewState(base)).toBe('empty')
    expect(searchViewState({ ...base, results: [dj] })).toBe('results')
  })
})

describe('createLatestGate', () => {
  it('only the most recent token is latest', () => {
    const gate = createLatestGate()
    const a = gate.next()
    const b = gate.next()
    expect(gate.isLatest(a)).toBe(false)
    expect(gate.isLatest(b)).toBe(true)
  })

  it('gates are independent', () => {
    const one = createLatestGate()
    const two = createLatestGate()
    const a = one.next()
    two.next()
    two.next()
    expect(one.isLatest(a)).toBe(true)
  })
})

describe('moveActive', () => {
  it('ArrowDown goes to the first from nothing and wraps at the end', () => {
    expect(moveActive(-1, 'ArrowDown', 3)).toBe(0)
    expect(moveActive(0, 'ArrowDown', 3)).toBe(1)
    expect(moveActive(2, 'ArrowDown', 3)).toBe(0)
  })

  it('ArrowUp goes to the last from nothing and wraps at the start', () => {
    expect(moveActive(-1, 'ArrowUp', 3)).toBe(2)
    expect(moveActive(0, 'ArrowUp', 3)).toBe(2)
    expect(moveActive(2, 'ArrowUp', 3)).toBe(1)
  })

  it('returns -1 when there is nothing to highlight', () => {
    expect(moveActive(0, 'ArrowDown', 0)).toBe(-1)
    expect(moveActive(-1, 'ArrowUp', 0)).toBe(-1)
    expect(moveActive(5, 'ArrowDown', 0)).toBe(-1)
  })
})

describe('resultsAnnouncement', () => {
  it('says how many DJs were found', () => {
    expect(resultsAnnouncement(0)).toBe('No DJs found')
    expect(resultsAnnouncement(1)).toBe('1 DJ found')
    expect(resultsAnnouncement(3)).toBe('3 DJs found')
  })
})

describe('mirrors of the server limits', () => {
  it('minChars matches server/src/userSearch.ts', () => {
    const source = readFileSync(SERVER_USER_SEARCH, 'utf8')
    const match = source.match(/SEARCH_LIMITS\s*=\s*\{[^}]*\bminChars:\s*(\d+)/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBe(SEARCH_LIMITS.minChars)
  })

  it('maxChars matches the server username maximum', () => {
    const source = readFileSync(SERVER_VALIDATION, 'utf8')
    const match = source.match(/\busernameMax:\s*(\d+)/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBe(SEARCH_LIMITS.maxChars)
  })
})
