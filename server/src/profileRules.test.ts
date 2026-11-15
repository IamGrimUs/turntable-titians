import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => ({
  db: { user: { findFirst: vi.fn() } },
}))

import { db } from './db'
import { prepareCrews, prepareUsername } from './profileRules'

const findFirst = db.user.findFirst as unknown as ReturnType<typeof vi.fn>

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (e) {
    return e as { message: string; extensions: { code: string } }
  }
  throw new Error('expected a rejection')
}

beforeEach(() => {
  findFirst.mockReset().mockResolvedValue(null)
})

describe('prepareUsername', () => {
  it('returns undefined when no username was supplied, without touching the database', async () => {
    expect(await prepareUsername(undefined, 'old', 'u1')).toBeUndefined()
    expect(await prepareUsername(null, 'old', 'u1')).toBeUndefined()
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('rejects an empty or blank username', async () => {
    for (const blank of ['', '   ']) {
      const err = await rejection(prepareUsername(blank, 'old', 'u1'))
      expect(err.extensions.code).toBe('BAD_USER_INPUT')
      expect(err.message).toBe('Username cannot be empty')
    }
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('returns the trimmed current username without validating or querying when unchanged', async () => {
    expect(await prepareUsername('  old  ', 'old', 'u1')).toBe('old')
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('does not re-validate an unchanged legacy username that breaks today\'s rules', async () => {
    expect(await prepareUsername('ab', 'ab', 'u1')).toBe('ab')
  })

  it('validates a changed username and checks uniqueness case-insensitively, excluding the user', async () => {
    expect(await prepareUsername(' newname ', 'old', 'u1')).toBe('newname')
    expect(findFirst).toHaveBeenCalledWith({
      where: { username: { equals: 'newname', mode: 'insensitive' }, NOT: { id: 'u1' } },
      select: { id: true },
    })
  })

  it('rejects a changed username that is taken', async () => {
    findFirst.mockResolvedValue({ id: 'other' })
    const err = await rejection(prepareUsername('Taken', 'old', 'u1'))
    expect(err.extensions.code).toBe('BAD_USER_INPUT')
    expect(err.message).toBe('Username already taken')
  })

  it('rejects an invalid or reserved changed username before querying', async () => {
    for (const bad of ['ab', 'has space', 'admin']) {
      const err = await rejection(prepareUsername(bad, 'old', 'u1'))
      expect(err.extensions.code).toBe('BAD_USER_INPUT')
    }
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('treats a current username of null as different from any supplied one', async () => {
    expect(await prepareUsername('fresh', null, 'u1')).toBe('fresh')
    expect(findFirst).toHaveBeenCalled()
  })
})

describe('prepareCrews', () => {
  it('returns undefined when no list was supplied', () => {
    expect(prepareCrews(undefined, ['a'])).toBeUndefined()
    expect(prepareCrews(null, ['a'])).toBeUndefined()
  })

  it('returns an unchanged list as given, without re-validating it', () => {
    const legacy = ['x'.repeat(100), 'x'.repeat(100)]
    expect(prepareCrews(legacy, [...legacy])).toBe(legacy)
  })

  it('cleans a changed list: trims, drops blanks, removes duplicates ignoring case', () => {
    expect(prepareCrews([' Crew A ', '', 'crew a', 'Crew B'], [])).toEqual(['Crew A', 'Crew B'])
  })

  it('rejects a changed list that breaks the rules', () => {
    expect(() => prepareCrews(['x'.repeat(41)], [])).toThrow()
    const tooMany = Array.from({ length: 11 }, (_, i) => `crew${i}`)
    expect(() => prepareCrews(tooMany, [])).toThrow()
  })
})
