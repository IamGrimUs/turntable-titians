import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    user: { findMany: vi.fn() },
    submission: { findMany: vi.fn() },
    vote: { groupBy: vi.fn() },
    battle: { findMany: vi.fn() },
  },
}))

vi.mock('./adminUserQuery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./adminUserQuery')>()
  return { ...actual, queryAdminUsers: vi.fn(actual.queryAdminUsers) }
})

import { db } from './db'
import { queryAdminUsers } from './adminUserQuery'
import { adminQuery, adminMutation, AdminUser } from './adminResolvers'

const userFindMany = db.user.findMany as unknown as ReturnType<typeof vi.fn>
const submissionFindMany = db.submission.findMany as unknown as ReturnType<typeof vi.fn>
const voteGroupBy = db.vote.groupBy as unknown as ReturnType<typeof vi.fn>
const battleFindMany = db.battle.findMany as unknown as ReturnType<typeof vi.fn>
const querySpy = queryAdminUsers as unknown as ReturnType<typeof vi.fn>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminUsers = adminQuery.adminUsers as (...args: any[]) => Promise<any>

const defaults = { filter: 'ALL', sortKey: 'createdAt', sortDir: 'DESC', page: 1, pageSize: 25 }
const anonymous = { userId: null }
const asUser = { userId: 'u1', role: 'USER' as const }
const asAdmin = { userId: 'adm', role: 'ADMIN' as const }

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (e) {
    return e as { message: string; extensions: { code: string } }
  }
  throw new Error('expected the resolver to throw')
}

function expectDbUntouched() {
  expect(userFindMany).not.toHaveBeenCalled()
  expect(submissionFindMany).not.toHaveBeenCalled()
  expect(voteGroupBy).not.toHaveBeenCalled()
  expect(battleFindMany).not.toHaveBeenCalled()
}

const dbUser = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  username: id,
  name: null,
  image: null,
  email: `${id}@example.com`,
  role: 'USER',
  externalCrews: [],
  internalCrews: [],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  lastSignInAt: new Date('2026-02-01T00:00:00.000Z'),
  suspendedAt: null,
  suspendedUntil: null,
  suspensionReason: null,
  ...extra,
})

beforeEach(() => {
  userFindMany.mockReset().mockResolvedValue([])
  submissionFindMany.mockReset().mockResolvedValue([])
  voteGroupBy.mockReset().mockResolvedValue([])
  battleFindMany.mockReset().mockResolvedValue([])
  querySpy.mockClear()
})

describe('adminUsers', () => {
  it('rejects an anonymous caller with UNAUTHENTICATED before touching the database', async () => {
    const err = await rejection(adminUsers({}, defaults, anonymous))
    expect(err.extensions.code).toBe('UNAUTHENTICATED')
    expectDbUntouched()
  })

  it('rejects a USER with FORBIDDEN before touching the database', async () => {
    const err = await rejection(adminUsers({}, defaults, asUser))
    expect(err.extensions.code).toBe('FORBIDDEN')
    expectDbUntouched()
  })

  it('rejects a signed-in caller with no role in the context as a USER', async () => {
    const err = await rejection(adminUsers({}, defaults, { userId: 'u1' }))
    expect(err.extensions.code).toBe('FORBIDDEN')
    expectDbUntouched()
  })

  it('rejects a suspended admin with FORBIDDEN before touching the database', async () => {
    const ctx = { userId: 'adm', role: 'ADMIN' as const, suspension: { reason: 'x', until: null } }
    const err = await rejection(adminUsers({}, defaults, ctx))
    expect(err.extensions.code).toBe('FORBIDDEN')
    expectDbUntouched()
  })

  it('returns a page built from the mocked tables for an ADMIN', async () => {
    userFindMany.mockResolvedValue([
      dbUser('a', { internalCrews: [{ crew: { name: 'Crew One' } }] }),
      dbUser('b', { role: 'ADMIN', createdAt: new Date('2026-03-01T00:00:00.000Z') }),
    ])
    submissionFindMany.mockResolvedValue([{ id: 's1', userId: 'a', battleId: 'b1' }])
    voteGroupBy.mockImplementation(async (args: { by: string[] }) =>
      args.by[0] === 'submissionId' ? [{ submissionId: 's1', _count: 4 }] : [{ userId: 'b', _count: 1 }]
    )

    const page = await adminUsers({}, defaults, asAdmin)
    expect(page.total).toBe(2)
    expect(page.page).toBe(1)
    expect(page.pageCount).toBe(1)
    expect(page.counts).toEqual({ all: 2, active: 2, suspended: 0, admins: 1 })
    // default sort: createdAt DESC
    expect(page.rows.map((r: { id: string }) => r.id)).toEqual(['b', 'a'])
    const a = page.rows.find((r: { id: string }) => r.id === 'a')
    expect(a).toMatchObject({ email: 'a@example.com', crews: ['Crew One'], entries: 1, votesReceived: 4, votesCast: 0 })
  })

  it('passes search, filter, sort and paging args through to queryAdminUsers', async () => {
    userFindMany.mockResolvedValue([dbUser('a')])
    const args = { search: 'dj', filter: 'ADMINS', sortKey: 'battlesWon', sortDir: 'ASC', page: 3, pageSize: 10 }

    await adminUsers({}, args, asAdmin)

    expect(querySpy).toHaveBeenCalledTimes(1)
    const [rows, opts] = querySpy.mock.calls[0]
    expect(Array.isArray(rows)).toBe(true)
    expect(opts).toEqual(args)
  })

  it('passes the default values through unchanged', async () => {
    await adminUsers({}, defaults, asAdmin)
    expect(querySpy.mock.calls[0][1]).toEqual(defaults)
  })

  it('loads every user, not a subset (no id filter)', async () => {
    await adminUsers({}, defaults, asAdmin)
    expect(userFindMany.mock.calls[0][0]).not.toHaveProperty('where')
  })
})

describe('AdminUser date fields', () => {
  it('returns ISO strings for createdAt, lastSignInAt and suspendedUntil', () => {
    const row = {
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      lastSignInAt: new Date('2026-02-01T00:00:00.000Z'),
      suspendedUntil: new Date('2026-12-01T00:00:00.000Z'),
    }
    expect(AdminUser.createdAt(row)).toBe('2026-01-01T00:00:00.000Z')
    expect(AdminUser.lastSignInAt(row)).toBe('2026-02-01T00:00:00.000Z')
    expect(AdminUser.suspendedUntil(row)).toBe('2026-12-01T00:00:00.000Z')
  })

  it('returns null for a missing suspendedUntil', () => {
    expect(AdminUser.suspendedUntil({ suspendedUntil: null })).toBeNull()
  })
})

describe('adminMutation', () => {
  it('has no mutations yet', () => {
    expect(Object.keys(adminMutation)).toEqual([])
  })
})
