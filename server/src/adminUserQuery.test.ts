import { describe, it, expect } from 'vitest'
import type { AdminUserRow } from './adminUserStats'
import {
  queryAdminUsers,
  clampPage,
  clampPageSize,
  type UserQueryOptions,
  type UserSortKey,
} from './adminUserQuery'

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

function row(id: string, extra: Partial<AdminUserRow>): AdminUserRow {
  return {
    id,
    username: id,
    name: null,
    image: null,
    email: `${id}@example.com`,
    role: 'USER',
    status: 'ACTIVE',
    suspendedUntil: null,
    suspensionReason: null,
    crews: [],
    entries: 0,
    battlesWon: 0,
    votesCast: 0,
    votesReceived: 0,
    ideasPosted: 0,
    createdAt: d('2026-01-01'),
    lastSignInAt: d('2026-01-01'),
    ...extra,
  }
}

// Five rows with distinct values in every sortable column (except role and status, which tie on purpose).
const u1 = row('u1', {
  username: 'alice',
  name: 'Alice Smith',
  email: 'alice@example.com',
  role: 'USER',
  status: 'ACTIVE',
  crews: ['A', 'B'],
  entries: 5,
  battlesWon: 2,
  votesCast: 10,
  votesReceived: 30,
  ideasPosted: 0,
  createdAt: d('2026-01-01'),
  lastSignInAt: d('2026-11-10'),
})
const u2 = row('u2', {
  username: 'bob',
  name: 'Bob Jones',
  email: 'zed@example.com',
  role: 'ADMIN',
  status: 'ACTIVE',
  crews: [],
  entries: 1,
  battlesWon: 0,
  votesCast: 40,
  votesReceived: 5,
  ideasPosted: 7,
  createdAt: d('2026-03-01'),
  lastSignInAt: d('2026-11-01'),
})
const u3 = row('u3', {
  username: 'carol',
  name: 'Carol',
  email: 'carol@example.com',
  role: 'OWNER',
  status: 'ACTIVE',
  crews: ['C'],
  entries: 3,
  battlesWon: 4,
  votesCast: 20,
  votesReceived: 50,
  ideasPosted: 7,
  createdAt: d('2026-02-01'),
  lastSignInAt: d('2026-11-14'),
})
const u4 = row('u4', {
  username: null,
  name: null,
  email: 'mallory@example.com',
  role: 'USER',
  status: 'SUSPENDED',
  crews: ['D', 'E', 'F'],
  entries: 2,
  battlesWon: 1,
  votesCast: 0,
  votesReceived: 20,
  ideasPosted: 2,
  createdAt: d('2026-05-01'),
  lastSignInAt: d('2026-10-01'),
})
const u5 = row('u5', {
  username: 'dave',
  name: 'Dave',
  email: 'dave@example.org',
  role: 'USER',
  status: 'SUSPENDED',
  crews: ['G', 'H', 'I', 'J'],
  entries: 4,
  battlesWon: 3,
  votesCast: 30,
  votesReceived: 10,
  ideasPosted: 0,
  createdAt: d('2026-04-01'),
  lastSignInAt: d('2026-11-12'),
})

// Deliberately not in any sorted order.
const fixture = (): AdminUserRow[] => [u3, u5, u1, u4, u2]

const ids = (opts: UserQueryOptions, rows: AdminUserRow[] = fixture()) =>
  queryAdminUsers(rows, { pageSize: 100, ...opts }).rows.map((r) => r.id)

describe('queryAdminUsers sorting', () => {
  // [sortKey, ids ascending]
  const ascending: Array<[UserSortKey, string[]]> = [
    ['role', ['u1', 'u4', 'u5', 'u2', 'u3']], // USER < ADMIN < OWNER, ties by id
    ['username', ['u1', 'u2', 'u3', 'u5', 'u4']], // null username last
    ['crews', ['u2', 'u3', 'u1', 'u4', 'u5']], // by number of crews
    ['status', ['u1', 'u2', 'u3', 'u4', 'u5']], // ACTIVE < SUSPENDED, ties by id
    ['entries', ['u2', 'u4', 'u3', 'u5', 'u1']],
    ['battlesWon', ['u2', 'u4', 'u1', 'u5', 'u3']],
    ['votesCast', ['u4', 'u1', 'u3', 'u5', 'u2']],
    ['votesReceived', ['u2', 'u5', 'u4', 'u1', 'u3']],
    ['ideasPosted', ['u1', 'u5', 'u4', 'u2', 'u3']], // ties (0, 0 and 7, 7) by id
    ['createdAt', ['u1', 'u3', 'u2', 'u5', 'u4']],
    ['lastSignInAt', ['u4', 'u2', 'u1', 'u5', 'u3']],
    ['email', ['u1', 'u3', 'u5', 'u4', 'u2']],
  ]

  for (const [sortKey, asc] of ascending) {
    it(`sorts by ${sortKey} ascending`, () => {
      expect(ids({ sortKey, sortDir: 'ASC' })).toEqual(asc)
    })
  }

  // Descending is the exact reverse, except where keys tie (ties stay in id order) or the
  // key is null (null usernames stay last in both directions).
  const descending: Array<[UserSortKey, string[]]> = [
    ['role', ['u3', 'u2', 'u1', 'u4', 'u5']],
    ['username', ['u5', 'u3', 'u2', 'u1', 'u4']],
    ['crews', ['u5', 'u4', 'u1', 'u3', 'u2']],
    ['status', ['u4', 'u5', 'u1', 'u2', 'u3']],
    ['entries', ['u1', 'u5', 'u3', 'u4', 'u2']],
    ['battlesWon', ['u3', 'u5', 'u1', 'u4', 'u2']],
    ['votesCast', ['u2', 'u5', 'u3', 'u1', 'u4']],
    ['votesReceived', ['u3', 'u1', 'u4', 'u5', 'u2']],
    ['ideasPosted', ['u2', 'u3', 'u4', 'u1', 'u5']], // ties stay in id order
    ['createdAt', ['u4', 'u5', 'u2', 'u3', 'u1']],
    ['lastSignInAt', ['u3', 'u5', 'u1', 'u2', 'u4']],
    ['email', ['u2', 'u4', 'u5', 'u3', 'u1']],
  ]

  for (const [sortKey, desc] of descending) {
    it(`sorts by ${sortKey} descending`, () => {
      expect(ids({ sortKey, sortDir: 'DESC' })).toEqual(desc)
    })
  }

  it('defaults to createdAt descending (newest first)', () => {
    expect(ids({})).toEqual(['u4', 'u5', 'u2', 'u3', 'u1'])
  })

  it('falls back to createdAt for an unknown sortKey', () => {
    expect(ids({ sortKey: 'passwordHash' as UserSortKey, sortDir: 'ASC' })).toEqual(['u1', 'u3', 'u2', 'u5', 'u4'])
    expect(ids({ sortKey: '__proto__' as UserSortKey })).toEqual(['u4', 'u5', 'u2', 'u3', 'u1'])
    expect(ids({ sortKey: 'toString' as UserSortKey })).toEqual(['u4', 'u5', 'u2', 'u3', 'u1'])
  })

  it('falls back to DESC for an unknown sortDir', () => {
    expect(ids({ sortKey: 'entries', sortDir: 'sideways' as 'ASC' })).toEqual(['u1', 'u5', 'u3', 'u4', 'u2'])
  })

  it('breaks ties by id ascending in both directions', () => {
    const tied = [
      row('c', { entries: 1 }),
      row('a', { entries: 1 }),
      row('d', { entries: 2 }),
      row('b', { entries: 1 }),
    ]
    expect(ids({ sortKey: 'entries', sortDir: 'ASC' }, tied)).toEqual(['a', 'b', 'c', 'd'])
    expect(ids({ sortKey: 'entries', sortDir: 'DESC' }, tied)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('gives the same order whatever order the input arrives in', () => {
    const tied = [row('c', { entries: 1 }), row('a', { entries: 1 }), row('b', { entries: 1 })]
    const reversed = [...tied].reverse()
    expect(ids({ sortKey: 'entries' }, tied)).toEqual(ids({ sortKey: 'entries' }, reversed))
  })

  it('keeps users without a username last in both directions, ordered by id among themselves', () => {
    const rows = [row('z2', { username: null }), row('m', { username: 'mike' }), row('z1', { username: null }), row('a', { username: 'amy' })]
    expect(ids({ sortKey: 'username', sortDir: 'ASC' }, rows)).toEqual(['a', 'm', 'z1', 'z2'])
    expect(ids({ sortKey: 'username', sortDir: 'DESC' }, rows)).toEqual(['m', 'a', 'z1', 'z2'])
  })

  it('does not mutate the input array or its rows', () => {
    const input = Object.freeze(fixture()) as AdminUserRow[]
    const before = input.map((r) => r.id)
    expect(() => queryAdminUsers(input, { sortKey: 'email', sortDir: 'ASC', search: 'a' })).not.toThrow()
    expect(input.map((r) => r.id)).toEqual(before)
  })
})

describe('queryAdminUsers filters and counts', () => {
  it('ALL returns everyone and is the default', () => {
    expect(ids({ filter: 'ALL' }).sort()).toEqual(['u1', 'u2', 'u3', 'u4', 'u5'])
    expect(ids({}).sort()).toEqual(['u1', 'u2', 'u3', 'u4', 'u5'])
  })

  it('ACTIVE returns only active users', () => {
    expect(ids({ filter: 'ACTIVE', sortKey: 'email', sortDir: 'ASC' })).toEqual(['u1', 'u3', 'u2'])
  })

  it('SUSPENDED returns only suspended users', () => {
    expect(ids({ filter: 'SUSPENDED', sortKey: 'email', sortDir: 'ASC' })).toEqual(['u5', 'u4'])
  })

  it('ADMINS returns admins and the owner', () => {
    expect(ids({ filter: 'ADMINS', sortKey: 'email', sortDir: 'ASC' })).toEqual(['u3', 'u2'])
  })

  it('treats an unknown filter as ALL', () => {
    expect(ids({ filter: 'EVERYTHING' as 'ALL' }).sort()).toEqual(['u1', 'u2', 'u3', 'u4', 'u5'])
  })

  it('reports counts for all four chips', () => {
    expect(queryAdminUsers(fixture(), {}).counts).toEqual({ all: 5, active: 3, suspended: 2, admins: 2 })
  })

  it('counts ignore both the filter and the search', () => {
    const page = queryAdminUsers(fixture(), { filter: 'SUSPENDED', search: 'dave' })
    expect(page.total).toBe(1)
    expect(page.counts).toEqual({ all: 5, active: 3, suspended: 2, admins: 2 })
  })

  it('total is the number of rows after search and filter', () => {
    expect(queryAdminUsers(fixture(), { filter: 'ACTIVE' }).total).toBe(3)
    expect(queryAdminUsers(fixture(), { filter: 'ACTIVE', search: 'zed' }).total).toBe(1)
  })
})

describe('queryAdminUsers search', () => {
  it('matches username case-insensitively', () => {
    expect(ids({ search: 'ALICE' })).toEqual(['u1'])
  })

  it('matches name case-insensitively', () => {
    expect(ids({ search: 'jOnEs' })).toEqual(['u2'])
  })

  it('matches email case-insensitively, including rows with no username or name', () => {
    expect(ids({ search: 'MALLORY@' })).toEqual(['u4'])
  })

  it('matches a substring anywhere in the field', () => {
    expect(ids({ search: 'ar', sortKey: 'email', sortDir: 'ASC' })).toEqual(['u3'])
    expect(ids({ search: 'example.org' })).toEqual(['u5'])
  })

  it('ignores leading and trailing spaces and treats blank or missing search as no search', () => {
    expect(ids({ search: '  alice  ' })).toEqual(['u1'])
    expect(ids({ search: '   ' })).toHaveLength(5)
    expect(ids({ search: '' })).toHaveLength(5)
    expect(ids({ search: null })).toHaveLength(5)
    expect(ids({ search: undefined })).toHaveLength(5)
  })

  it('returns nothing when no row matches', () => {
    const page = queryAdminUsers(fixture(), { search: 'nobody-has-this' })
    expect(page.rows).toEqual([])
    expect(page.total).toBe(0)
    expect(page.pageCount).toBe(1)
  })

  // Search is a plain substring match: never a regex, never a SQL/LIKE pattern.
  for (const text of ['%', '_', '.*', '^', '$', '[a-z]', '(', '\\', "'; DROP TABLE users; --", 'a.*e', 'a|b']) {
    it(`treats ${JSON.stringify(text)} as literal text and matches nothing in the fixture`, () => {
      let page: ReturnType<typeof queryAdminUsers> | undefined
      expect(() => {
        page = queryAdminUsers(fixture(), { search: text })
      }).not.toThrow()
      expect(page?.rows).toEqual([])
      expect(page?.total).toBe(0)
    })
  }

  it('matches special characters only when a row literally contains them', () => {
    const rows = [row('p', { name: '100% real' }), row('q', { username: 'a_b' }), row('r', { name: 'plain' })]
    expect(ids({ search: '%' }, rows)).toEqual(['p'])
    expect(ids({ search: '_' }, rows)).toEqual(['q'])
    expect(ids({ search: '.*' }, rows)).toEqual([])
  })

  it('ignores a non-string search instead of throwing', () => {
    expect(() => queryAdminUsers(fixture(), { search: 42 as unknown as string })).not.toThrow()
    expect(ids({ search: { a: 1 } as unknown as string })).toHaveLength(5)
  })
})

describe('queryAdminUsers paging', () => {
  const five = () => fixture()

  it('pages the sorted rows and reports page, pageCount and total', () => {
    const p1 = queryAdminUsers(five(), { sortKey: 'email', sortDir: 'ASC', pageSize: 2, page: 1 })
    expect(p1.rows.map((r) => r.id)).toEqual(['u1', 'u3'])
    expect(p1).toMatchObject({ page: 1, pageCount: 3, total: 5 })

    const p3 = queryAdminUsers(five(), { sortKey: 'email', sortDir: 'ASC', pageSize: 2, page: 3 })
    expect(p3.rows.map((r) => r.id)).toEqual(['u2'])
    expect(p3.page).toBe(3)
  })

  it('defaults to page 1 and 25 rows per page', () => {
    const many = Array.from({ length: 60 }, (_, i) => row(`id${String(i).padStart(2, '0')}`, {}))
    const page = queryAdminUsers(many, {})
    expect(page.rows).toHaveLength(25)
    expect(page).toMatchObject({ page: 1, pageCount: 3, total: 60 })
  })

  for (const bad of [0, -3, Number.NaN, Infinity, -Infinity]) {
    it(`resolves page ${String(bad)} to page 1`, () => {
      const page = queryAdminUsers(five(), { pageSize: 2, page: bad })
      expect(page.page).toBe(1)
      expect(page.rows).toHaveLength(2)
    })
  }

  it('clamps page 9999 to the last page', () => {
    const page = queryAdminUsers(five(), { sortKey: 'email', sortDir: 'ASC', pageSize: 2, page: 9999 })
    expect(page.page).toBe(3)
    expect(page.rows.map((r) => r.id)).toEqual(['u2'])
  })

  it('floors a fractional page', () => {
    expect(queryAdminUsers(five(), { pageSize: 2, page: 2.9 }).page).toBe(2)
  })

  it('clamps pageSize into 1..100: 0 -> 1, -1 -> 1, 10000 -> 100, 7.9 -> 7', () => {
    const many = Array.from({ length: 250 }, (_, i) => row(`id${String(i).padStart(3, '0')}`, {}))
    expect(queryAdminUsers(many, { pageSize: 0 }).rows).toHaveLength(1)
    expect(queryAdminUsers(many, { pageSize: -1 }).rows).toHaveLength(1)
    expect(queryAdminUsers(many, { pageSize: 10000 }).rows).toHaveLength(100)
    expect(queryAdminUsers(many, { pageSize: 7.9 }).rows).toHaveLength(7)
    expect(queryAdminUsers(many, { pageSize: 0 }).pageCount).toBe(250)
    expect(queryAdminUsers(many, { pageSize: 10000 }).pageCount).toBe(3)
  })

  it('falls back to 25 for a non-finite or non-number pageSize', () => {
    const many = Array.from({ length: 60 }, (_, i) => row(`id${String(i).padStart(2, '0')}`, {}))
    for (const bad of [Number.NaN, Infinity, -Infinity, undefined, null, '12']) {
      expect(queryAdminUsers(many, { pageSize: bad as unknown as number }).rows).toHaveLength(25)
    }
  })

  it('gives pageCount 1, page 1 and no rows for empty input', () => {
    const page = queryAdminUsers([], { page: 5, pageSize: 10 })
    expect(page.rows).toEqual([])
    expect(page.total).toBe(0)
    expect(page.page).toBe(1)
    expect(page.pageCount).toBe(1)
    expect(page.counts).toEqual({ all: 0, active: 0, suspended: 0, admins: 0 })
  })
})

describe('clampPageSize', () => {
  // Rule: non-number or non-finite -> fallback; otherwise floor, then clamp into 1..max.
  it('applies the rule', () => {
    expect(clampPageSize(0, 25, 100)).toBe(1)
    expect(clampPageSize(-1, 25, 100)).toBe(1)
    expect(clampPageSize(10000, 25, 100)).toBe(100)
    expect(clampPageSize(7.9, 25, 100)).toBe(7)
    expect(clampPageSize(0.5, 25, 100)).toBe(1)
    expect(clampPageSize(50, 25, 100)).toBe(50)
  })

  it('uses the fallback for non-finite and non-number values', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, undefined, null, '12', {}, [], true]) {
      expect(clampPageSize(bad, 50, 100)).toBe(50)
    }
  })
})

describe('clampPage', () => {
  it('floors and clamps into 1..pageCount', () => {
    expect(clampPage(2, 5)).toBe(2)
    expect(clampPage(2.9, 5)).toBe(2)
    expect(clampPage(0, 5)).toBe(1)
    expect(clampPage(-3, 5)).toBe(1)
    expect(clampPage(9999, 5)).toBe(5)
  })

  it('returns 1 for non-number and non-finite values', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, undefined, null, '3', {}]) {
      expect(clampPage(bad, 5)).toBe(1)
    }
  })

  it('treats a pageCount below 1 as 1', () => {
    expect(clampPage(4, 0)).toBe(1)
    expect(clampPage(4, -2)).toBe(1)
    expect(clampPage(4, Number.NaN)).toBe(1)
  })
})
