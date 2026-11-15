import type { AdminUserRow } from './adminUserStats'
import type { Role } from './permissions'

export type UserSortKey =
  | 'role'
  | 'username'
  | 'crews'
  | 'status'
  | 'entries'
  | 'battlesWon'
  | 'votesCast'
  | 'votesReceived'
  | 'createdAt'
  | 'lastSignInAt'
  | 'email'

export type UserFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'ADMINS'

export interface UserQueryOptions {
  search?: string | null
  filter?: UserFilter
  sortKey?: UserSortKey
  sortDir?: 'ASC' | 'DESC'
  page?: number
  pageSize?: number
}

export interface UserPage {
  rows: AdminUserRow[]
  total: number
  page: number
  pageCount: number
  counts: { all: number; active: number; suspended: number; admins: number }
}

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100
const DEFAULT_SORT_KEY: UserSortKey = 'createdAt'

const ROLE_RANK: Record<Role, number> = { USER: 0, ADMIN: 1, OWNER: 2 }

type Compare = (a: AdminUserRow, b: AdminUserRow) => number

const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const num = (a: number, b: number) => a - b

// Own-property lookup table, so inherited names like "toString" or "__proto__" are never valid keys.
const COMPARERS: Record<UserSortKey, Compare> = {
  role: (a, b) => num(ROLE_RANK[a.role], ROLE_RANK[b.role]),
  // Null usernames are handled in compareRows so they stay last in both directions.
  username: (a, b) => text((a.username ?? '').toLowerCase(), (b.username ?? '').toLowerCase()),
  crews: (a, b) => num(a.crews.length, b.crews.length),
  status: (a, b) => text(a.status, b.status), // 'ACTIVE' < 'SUSPENDED'
  entries: (a, b) => num(a.entries, b.entries),
  battlesWon: (a, b) => num(a.battlesWon, b.battlesWon),
  votesCast: (a, b) => num(a.votesCast, b.votesCast),
  votesReceived: (a, b) => num(a.votesReceived, b.votesReceived),
  createdAt: (a, b) => num(a.createdAt.getTime(), b.createdAt.getTime()),
  lastSignInAt: (a, b) => num(a.lastSignInAt.getTime(), b.lastSignInAt.getTime()),
  email: (a, b) => text(a.email.toLowerCase(), b.email.toLowerCase()),
}

function resolveSortKey(value: unknown): UserSortKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(COMPARERS, value)
    ? (value as UserSortKey)
    : DEFAULT_SORT_KEY
}

/** Non-number or non-finite -> fallback; otherwise floor, then clamp into 1..max. */
export function clampPageSize(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(1, Math.floor(value)))
}

/** Non-number or non-finite -> 1; otherwise floor, then clamp into 1..max(pageCount, 1). */
export function clampPage(value: unknown, pageCount: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  const last = Number.isFinite(pageCount) ? Math.max(1, Math.floor(pageCount)) : 1
  return Math.min(last, Math.max(1, Math.floor(value)))
}

function matchesFilter(row: AdminUserRow, filter: UserFilter): boolean {
  switch (filter) {
    case 'ACTIVE':
      return row.status === 'ACTIVE'
    case 'SUSPENDED':
      return row.status === 'SUSPENDED'
    case 'ADMINS':
      return row.role === 'ADMIN' || row.role === 'OWNER'
    default:
      return true // 'ALL' and anything unrecognised
  }
}

/**
 * Search, filter, sort and page the admin user rows. Pure: no database, never modifies its input.
 *
 * Search is a plain case-insensitive substring match (after trimming) on username, name and
 * email. It is never turned into a regex or a SQL/LIKE pattern, so `%`, `_`, `.*` and quotes
 * only match rows that literally contain them. `counts` ignore search and filter.
 *
 * Sorting: unknown keys fall back to createdAt, an unknown direction to DESC. Ties are broken by
 * id ascending in both directions, so the order is stable and independent of input order.
 * Users without a username sort last whichever direction is chosen (an empty username is not
 * "smaller than everyone"), and are ordered by id among themselves.
 */
export function queryAdminUsers(rows: AdminUserRow[], opts: UserQueryOptions = {}): UserPage {
  const counts = { all: rows.length, active: 0, suspended: 0, admins: 0 }
  for (const row of rows) {
    if (row.status === 'ACTIVE') counts.active += 1
    else if (row.status === 'SUSPENDED') counts.suspended += 1
    if (row.role === 'ADMIN' || row.role === 'OWNER') counts.admins += 1
  }

  const needle = typeof opts.search === 'string' ? opts.search.trim().toLowerCase() : ''
  const filter = opts.filter ?? 'ALL'

  const matched = rows.filter((row) => {
    if (!matchesFilter(row, filter)) return false
    if (needle === '') return true
    return (
      (row.username ?? '').toLowerCase().includes(needle) ||
      (row.name ?? '').toLowerCase().includes(needle) ||
      row.email.toLowerCase().includes(needle)
    )
  })

  const sortKey = resolveSortKey(opts.sortKey)
  const dir = opts.sortDir === 'ASC' ? 1 : -1
  const compare = COMPARERS[sortKey]

  // `matched` is already a copy (filter), so sorting it does not touch the caller's array.
  matched.sort((a, b) => {
    if (sortKey === 'username') {
      const aNull = a.username === null
      const bNull = b.username === null
      if (aNull !== bNull) return aNull ? 1 : -1
      if (aNull && bNull) return text(a.id, b.id)
    }
    return compare(a, b) * dir || text(a.id, b.id)
  })

  const total = matched.length
  const pageSize = clampPageSize(opts.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = clampPage(opts.page, pageCount)
  const start = (page - 1) * pageSize

  return { rows: matched.slice(start, start + pageSize), total, page, pageCount, counts }
}
