import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./db', () => ({
  db: { user: { findMany: vi.fn() } },
}))

import { db } from './db'
import { cleanSearchText, SEARCH_LIMITS, userSearchQuery } from './userSearch'

const findMany = db.user.findMany as unknown as ReturnType<typeof vi.fn>

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

  it('trims again after dropping the leading @', () => {
    expect(cleanSearchText('@ sk')).toBe('sk')
    expect(cleanSearchText(' @ sk ')).toBe('sk')
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

describe('searchUsers', () => {
  const NOW = new Date('2026-11-19T12:00:00.000Z')
  const row = (n: number, extra: Record<string, unknown> = {}) => ({
    id: `u${n}`,
    username: `sk${n}`,
    image: null,
    externalCrews: [],
    ...extra,
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    findMany.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns nothing and never queries for invalid text', async () => {
    for (const bad of ['', ' ', 'a', '@', '@a', 'a b', '100%', 'x'.repeat(100), '😀😀']) {
      expect(await userSearchQuery.searchUsers({}, { query: bad })).toEqual([])
    }
    expect(findMany).not.toHaveBeenCalled()
  })

  it('first query: prefix match, ordered, capped, selecting only public fields, excluding suspended and unnamed', async () => {
    findMany.mockResolvedValue([])
    await userSearchQuery.searchUsers({}, { query: '@sk' })
    expect(findMany).toHaveBeenCalledTimes(2)
    expect(findMany.mock.calls[0][0]).toEqual({
      where: {
        username: { startsWith: 'sk', mode: 'insensitive' },
        OR: [{ suspendedAt: null }, { suspendedUntil: { lte: NOW } }],
      },
      orderBy: { username: 'asc' },
      take: 8,
      select: { id: true, username: true, image: true, externalCrews: true },
    })
  })

  it('second query: contains match, skips the prefix ids, takes only what is left', async () => {
    findMany.mockResolvedValueOnce([row(1), row(2), row(3)]).mockResolvedValueOnce([])
    await userSearchQuery.searchUsers({}, { query: 'sk' })
    expect(findMany).toHaveBeenCalledTimes(2)
    expect(findMany.mock.calls[1][0]).toEqual({
      where: {
        username: { contains: 'sk', mode: 'insensitive' },
        id: { notIn: ['u1', 'u2', 'u3'] },
        OR: [{ suspendedAt: null }, { suspendedUntil: { lte: NOW } }],
      },
      orderBy: { username: 'asc' },
      take: 5,
      select: { id: true, username: true, image: true, externalCrews: true },
    })
  })

  it('escapes _ in both queries so it matches only a literal underscore', async () => {
    findMany.mockResolvedValue([])
    await userSearchQuery.searchUsers({}, { query: 'dj_foo' })
    expect(findMany.mock.calls[0][0].where.username.startsWith).toBe('dj\\_foo')
    expect(findMany.mock.calls[1][0].where.username.contains).toBe('dj\\_foo')
  })

  it('escapes every _, and passes text without one through unchanged', async () => {
    findMany.mockResolvedValue([])
    await userSearchQuery.searchUsers({}, { query: '__' })
    expect(findMany.mock.calls[0][0].where.username.startsWith).toBe('\\_\\_')
    expect(findMany.mock.calls[1][0].where.username.contains).toBe('\\_\\_')

    findMany.mockClear()
    await userSearchQuery.searchUsers({}, { query: 'dj-foo.1' })
    expect(findMany.mock.calls[0][0].where.username.startsWith).toBe('dj-foo.1')
    expect(findMany.mock.calls[1][0].where.username.contains).toBe('dj-foo.1')
  })

  it('does not run a second query when the prefix matches already fill the limit', async () => {
    findMany.mockResolvedValueOnce(Array.from({ length: 8 }, (_, i) => row(i)))
    const result = await userSearchQuery.searchUsers({}, { query: 'sk' })
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(8)
  })

  it('lists prefix matches first, then contains matches', async () => {
    findMany
      .mockResolvedValueOnce([row(1), row(2)])
      .mockResolvedValueOnce([row(3, { username: 'dj_sk' })])
    const result = await userSearchQuery.searchUsers({}, { query: 'sk' })
    expect(result.map((r) => r.id)).toEqual(['u1', 'u2', 'u3'])
  })

  it('crew is the first external crew or null; a row without a username is dropped', async () => {
    findMany
      .mockResolvedValueOnce([
        row(1, { externalCrews: ['Invisibl Skratch Piklz', 'Other'] }),
        row(2, { username: null }),
        row(3),
      ])
      .mockResolvedValueOnce([])
    const result = await userSearchQuery.searchUsers({}, { query: 'sk' })
    expect(result.map((r) => [r.id, r.crew])).toEqual([
      ['u1', 'Invisibl Skratch Piklz'],
      ['u3', null],
    ])
  })

  it('returns objects with exactly id, username, image and crew', async () => {
    findMany
      .mockResolvedValueOnce([
        { ...row(1, { image: 'https://x/y.png' }), email: 'a@b.c', role: 'ADMIN', suspensionReason: 'x' },
      ])
      .mockResolvedValueOnce([])
    const [first] = await userSearchQuery.searchUsers({}, { query: 'sk' })
    expect(Object.keys(first).sort()).toEqual(['crew', 'id', 'image', 'username'])
    expect(first.image).toBe('https://x/y.png')
  })
})
