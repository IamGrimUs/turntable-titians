import { describe, it, expect } from 'vitest'
import {
  rowActions,
  rowNote,
  nextSort,
  DEFAULT_SORT,
  formatJoined,
  formatLastSignIn,
  crewsCell,
  USER_SORT_KEYS,
} from './admin-users-view'

describe('rowActions', () => {
  it('admin on active user', () => {
    expect(rowActions('ADMIN', { role: 'USER', status: 'ACTIVE' })).toEqual(['edit', 'suspend', 'delete'])
  })
  it('admin on suspended user', () => {
    expect(rowActions('ADMIN', { role: 'USER', status: 'SUSPENDED' })).toEqual(['edit', 'reinstate', 'delete'])
  })
  it('admin on admin or owner gets nothing', () => {
    expect(rowActions('ADMIN', { role: 'ADMIN', status: 'ACTIVE' })).toEqual([])
    expect(rowActions('ADMIN', { role: 'OWNER', status: 'ACTIVE' })).toEqual([])
  })
  it('owner on active user', () => {
    expect(rowActions('OWNER', { role: 'USER', status: 'ACTIVE' })).toEqual([
      'edit',
      'suspend',
      'delete',
      'makeAdmin',
    ])
  })
  it('owner on suspended user', () => {
    expect(rowActions('OWNER', { role: 'USER', status: 'SUSPENDED' })).toEqual([
      'edit',
      'reinstate',
      'delete',
      'makeAdmin',
    ])
  })
  it('owner on admin', () => {
    expect(rowActions('OWNER', { role: 'ADMIN', status: 'ACTIVE' })).toEqual([
      'edit',
      'suspend',
      'delete',
      'removeAdmin',
    ])
    expect(rowActions('OWNER', { role: 'ADMIN', status: 'SUSPENDED' })).toEqual([
      'edit',
      'reinstate',
      'delete',
      'removeAdmin',
    ])
  })
  it('nobody acts on an owner, including the owner', () => {
    expect(rowActions('OWNER', { role: 'OWNER', status: 'ACTIVE' })).toEqual([])
  })
  it('fails closed for non-admin or junk viewers', () => {
    expect(rowActions('USER', { role: 'USER', status: 'ACTIVE' })).toEqual([])
    expect(rowActions('nope' as never, { role: 'USER', status: 'ACTIVE' })).toEqual([])
  })
})

describe('rowNote', () => {
  it('admin viewing admin: Owner only', () => {
    expect(rowNote('ADMIN', { role: 'ADMIN' })).toBe('Owner only')
  })
  it('owner viewing admin: no note (has actions)', () => {
    expect(rowNote('OWNER', { role: 'ADMIN' })).toBeNull()
  })
  it('owner target: Protected for everyone', () => {
    expect(rowNote('ADMIN', { role: 'OWNER' })).toBe('Protected')
    expect(rowNote('OWNER', { role: 'OWNER' })).toBe('Protected')
  })
  it('user target: no note', () => {
    expect(rowNote('ADMIN', { role: 'USER' })).toBeNull()
    expect(rowNote('OWNER', { role: 'USER' })).toBeNull()
  })
})

describe('sorting', () => {
  it('has a default of createdAt DESC', () => {
    expect(DEFAULT_SORT).toEqual({ key: 'createdAt', dir: 'DESC' })
    expect(USER_SORT_KEYS).toContain('createdAt')
  })
  it('toggles direction on the same key', () => {
    expect(nextSort({ key: 'email', dir: 'ASC' }, 'email')).toEqual({ key: 'email', dir: 'DESC' })
    expect(nextSort({ key: 'email', dir: 'DESC' }, 'email')).toEqual({ key: 'email', dir: 'ASC' })
  })
  it('starts a new key ascending', () => {
    expect(nextSort({ key: 'email', dir: 'DESC' }, 'username')).toEqual({ key: 'username', dir: 'ASC' })
  })
  it('does not mutate its input', () => {
    const current = { key: 'email', dir: 'ASC' } as const
    const next = nextSort(current, 'email')
    expect(next).not.toBe(current)
    expect(current).toEqual({ key: 'email', dir: 'ASC' })
  })
})

describe('formatJoined', () => {
  it('formats in UTC', () => {
    expect(formatJoined('2026-11-02T00:30:00.000Z')).toBe('Nov 2, 2026')
    expect(formatJoined('2026-11-02T23:59:00.000Z')).toBe('Nov 2, 2026')
  })
  it('returns an em dash for invalid input', () => {
    expect(formatJoined('not a date')).toBe('—')
    expect(formatJoined('')).toBe('—')
  })
})

describe('formatLastSignIn', () => {
  const now = new Date('2026-11-15T12:00:00.000Z')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const MIN = 60_000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR

  it('under a minute is just now', () => {
    expect(formatLastSignIn(ago(0), now)).toBe('just now')
    expect(formatLastSignIn(ago(59_000), now)).toBe('just now')
  })
  it('minutes', () => {
    expect(formatLastSignIn(ago(MIN), now)).toBe('1m ago')
    expect(formatLastSignIn(ago(5 * MIN), now)).toBe('5m ago')
    expect(formatLastSignIn(ago(59 * MIN), now)).toBe('59m ago')
  })
  it('hours', () => {
    expect(formatLastSignIn(ago(60 * MIN), now)).toBe('1h ago')
    expect(formatLastSignIn(ago(23 * HOUR), now)).toBe('23h ago')
  })
  it('days', () => {
    expect(formatLastSignIn(ago(24 * HOUR), now)).toBe('1d ago')
    expect(formatLastSignIn(ago(29 * DAY), now)).toBe('29d ago')
  })
  it('30 days or more falls back to the joined format', () => {
    expect(formatLastSignIn(ago(30 * DAY), now)).toBe('Oct 16, 2026')
    expect(formatLastSignIn('2026-01-05T10:00:00.000Z', now)).toBe('Jan 5, 2026')
  })
  it('future timestamps read as just now', () => {
    expect(formatLastSignIn(new Date(now.getTime() + 5 * MIN).toISOString(), now)).toBe('just now')
  })
  it('invalid input is an em dash', () => {
    expect(formatLastSignIn('garbage', now)).toBe('—')
  })
})

describe('crewsCell', () => {
  it('no crews', () => {
    expect(crewsCell([])).toEqual({ first: null, more: 0 })
  })
  it('one crew', () => {
    expect(crewsCell(['Invisibl'])).toEqual({ first: 'Invisibl', more: 0 })
  })
  it('three crews', () => {
    expect(crewsCell(['A', 'B', 'C'])).toEqual({ first: 'A', more: 2 })
  })
})
