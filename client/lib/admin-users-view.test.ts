import { describe, it, expect } from 'vitest'
import { getNamedType, isEnumType, isNonNullType, isObjectType, validate, type DocumentNode } from 'graphql'
import {
  rowActions,
  rowNote,
  rowNoteExplanation,
  nextSort,
  DEFAULT_SORT,
  formatJoined,
  formatLastSignIn,
  crewsCell,
  USER_SORT_KEYS,
} from './admin-users-view'
import * as admin from './graphql/admin'
import { loadServerSchema } from './test-support/server-sdl'

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

describe('rowNoteExplanation', () => {
  it('explains each note in a full sentence', () => {
    expect(rowNoteExplanation('Owner only')).toBe('Only the owner can change admins')
    expect(rowNoteExplanation('Protected')).toBe("The owner account can't be changed here")
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

describe('admin users against the server SDL', () => {
  const schema = loadServerSchema()

  it('USER_SORT_KEYS equals the server AdminUserSortKey enum (as a set)', () => {
    const type = schema.getType('AdminUserSortKey')
    expect(isEnumType(type)).toBe(true)
    if (!isEnumType(type)) return
    const serverKeys = type.getValues().map((v) => v.name)
    expect(serverKeys.length).toBeGreaterThan(0)
    expect(new Set(USER_SORT_KEYS)).toEqual(new Set(serverKeys))
    expect(USER_SORT_KEYS.length).toBe(serverKeys.length) // no duplicates on the client side
  })

  it('sorts by ideasPosted', () => {
    expect(USER_SORT_KEYS).toContain('ideasPosted')
    expect(nextSort(DEFAULT_SORT, 'ideasPosted')).toEqual({ key: 'ideasPosted', dir: 'ASC' })
  })

  it('AdminUser.ideasPosted is Int!', () => {
    const type = schema.getType('AdminUser')
    expect(isObjectType(type)).toBe(true)
    if (!isObjectType(type)) return
    const field = type.getFields().ideasPosted
    expect(field).toBeDefined()
    expect(isNonNullType(field.type)).toBe(true)
    expect(getNamedType(field.type).name).toBe('Int')
  })

  it('every admin document is valid, and the users query selects ideasPosted', () => {
    const documents = Object.entries(admin).filter(
      (entry): entry is [string, DocumentNode] => (entry[1] as DocumentNode | undefined)?.kind === 'Document',
    )
    expect(documents.map(([name]) => name)).toContain('ADMIN_USERS_QUERY')
    for (const [name, doc] of documents) {
      // Fragments alone fail validate (unused definition); skip documents with no operation.
      if (!doc.definitions.some((d) => d.kind === 'OperationDefinition')) continue
      expect({ name, errors: validate(schema, doc).map((e) => e.message) }).toEqual({ name, errors: [] })
    }
    expect(JSON.stringify(admin.ADMIN_USERS_QUERY.definitions)).toContain('"value":"ideasPosted"')
  })
})
