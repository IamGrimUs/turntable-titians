import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    adminAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
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
import { LIMITS } from './validation'

const userFindMany = db.user.findMany as unknown as ReturnType<typeof vi.fn>
const submissionFindMany = db.submission.findMany as unknown as ReturnType<typeof vi.fn>
const voteGroupBy = db.vote.groupBy as unknown as ReturnType<typeof vi.fn>
const battleFindMany = db.battle.findMany as unknown as ReturnType<typeof vi.fn>
const userFindUnique = db.user.findUnique as unknown as ReturnType<typeof vi.fn>
const userFindFirst = db.user.findFirst as unknown as ReturnType<typeof vi.fn>
const userUpdate = db.user.update as unknown as ReturnType<typeof vi.fn>
const auditCreate = db.adminAuditLog.create as unknown as ReturnType<typeof vi.fn>
const transaction = db.$transaction as unknown as ReturnType<typeof vi.fn>
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
  userFindUnique.mockReset()
  userFindFirst.mockReset().mockResolvedValue(null)
  userUpdate.mockReset().mockImplementation((args: unknown) => ({ op: 'user.update', args }))
  auditCreate.mockReset().mockImplementation((args: unknown) => ({ op: 'adminAuditLog.create', args }))
  transaction.mockReset().mockImplementation((ops: unknown[]) => Promise.all(ops))
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
  it('registers adminUpdateUser', () => {
    expect(Object.keys(adminMutation)).toContain('adminUpdateUser')
  })
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminUpdateUser = adminMutation.adminUpdateUser as (...args: any[]) => Promise<any>

const boss = { userId: 'adm', role: 'ADMIN' as const, username: 'boss', email: 'boss@example.com' }
const owner = { userId: 'own', role: 'OWNER' as const, username: 'chief', email: 'chief@example.com' }

const target = (extra: Record<string, unknown> = {}) => ({
  id: 't1',
  role: 'USER',
  username: 'oldname',
  name: 'Old Name',
  image: 'https://cdn.example.com/a.png',
  externalCrews: ['Crew A'],
  email: 't1@example.com',
  ...extra,
})

function expectNoWrites() {
  expect(transaction).not.toHaveBeenCalled()
  expect(userUpdate).not.toHaveBeenCalled()
  expect(auditCreate).not.toHaveBeenCalled()
}

describe('adminUpdateUser', () => {
  beforeEach(() => {
    userFindUnique.mockResolvedValue(target())
    userFindMany.mockResolvedValue([dbUser('t1')])
  })

  it('rejects an anonymous caller with UNAUTHENTICATED and writes nothing', async () => {
    const err = await rejection(adminUpdateUser({}, { userId: 't1', name: 'X' }, anonymous))
    expect(err.extensions.code).toBe('UNAUTHENTICATED')
    expectNoWrites()
  })

  it('rejects a USER caller with FORBIDDEN and writes nothing', async () => {
    const err = await rejection(adminUpdateUser({}, { userId: 't1', name: 'X' }, asUser))
    expect(err.extensions.code).toBe('FORBIDDEN')
    expectNoWrites()
  })

  describe('with a nonexistent userId, a caller who is not an admin learns nothing and costs no database read', () => {
    function expectNoDbTouched() {
      expect(userFindUnique).not.toHaveBeenCalled()
      expect(userFindFirst).not.toHaveBeenCalled()
      expectNoWrites()
    }

    beforeEach(() => {
      userFindUnique.mockResolvedValue(null)
    })

    it('anonymous: UNAUTHENTICATED, not NOT_FOUND', async () => {
      const err = await rejection(adminUpdateUser({}, { userId: 'nope', name: 'X' }, anonymous))
      expect(err.extensions.code).toBe('UNAUTHENTICATED')
      expectNoDbTouched()
    })

    it('USER: FORBIDDEN, not NOT_FOUND', async () => {
      const err = await rejection(adminUpdateUser({}, { userId: 'nope', name: 'X' }, asUser))
      expect(err.extensions.code).toBe('FORBIDDEN')
      expectNoDbTouched()
    })

    it('suspended ADMIN: FORBIDDEN, not NOT_FOUND', async () => {
      const suspended = { ...boss, suspension: { reason: 'spam', until: null } }
      const err = await rejection(adminUpdateUser({}, { userId: 'nope', name: 'X' }, suspended))
      expect(err.extensions.code).toBe('FORBIDDEN')
      expectNoDbTouched()
    })
  })

  it('rejects a nonexistent user with NOT_FOUND and writes nothing', async () => {
    userFindUnique.mockResolvedValue(null)
    const err = await rejection(adminUpdateUser({}, { userId: 'nope', name: 'X' }, boss))
    expect(err.extensions.code).toBe('NOT_FOUND')
    expectNoWrites()
  })

  it.each(['ADMIN', 'OWNER'])('rejects an ADMIN editing a %s with FORBIDDEN and writes nothing', async (role) => {
    userFindUnique.mockResolvedValue(target({ role }))
    const err = await rejection(adminUpdateUser({}, { userId: 't1', name: 'X' }, boss))
    expect(err.extensions.code).toBe('FORBIDDEN')
    expectNoWrites()
  })

  it('lets an OWNER edit an ADMIN', async () => {
    userFindUnique.mockResolvedValue(target({ role: 'ADMIN' }))
    await adminUpdateUser({}, { userId: 't1', name: 'X' }, owner)
    expect(userUpdate).toHaveBeenCalledTimes(1)
  })

  it('loads the target with the fields it needs', async () => {
    await adminUpdateUser({}, { userId: 't1', name: 'X' }, boss)
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: 't1' },
      select: { id: true, role: true, username: true, name: true, image: true, externalCrews: true, email: true },
    })
  })

  it('changes the username and writes the update and audit entry in ONE transaction', async () => {
    await adminUpdateUser({}, { userId: 't1', username: 'newname' }, boss)
    expect(transaction).toHaveBeenCalledTimes(1)
    const ops = transaction.mock.calls[0][0]
    expect(Array.isArray(ops)).toBe(true)
    expect(ops).toHaveLength(2)
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { username: 'newname' } })
    expect(ops[0]).toEqual({ op: 'user.update', args: { where: { id: 't1' }, data: { username: 'newname' } } })
    expect(auditCreate).toHaveBeenCalledTimes(1)
    expect(ops[1].op).toBe('adminAuditLog.create')
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        actorId: 'adm',
        actorUsername: 'boss',
        actorEmail: 'boss@example.com',
        action: 'USER_EDIT',
        targetType: 'USER',
        targetId: 't1',
        targetUsername: 'oldname',
        targetEmail: 't1@example.com',
        details: { changes: { username: { from: 'oldname', to: 'newname' } } },
      },
    })
  })

  it('returns the refreshed admin row from loadAdminUserRows', async () => {
    const row = await adminUpdateUser({}, { userId: 't1', username: 'newname' }, boss)
    expect(userFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['t1'] } } }))
    expect(row.id).toBe('t1')
  })

  it('rejects a username taken by someone else, ignoring case, and writes nothing', async () => {
    userFindFirst.mockResolvedValue({ id: 'other' })
    const err = await rejection(adminUpdateUser({}, { userId: 't1', username: 'TAKEN' }, boss))
    expect(err.extensions.code).toBe('BAD_USER_INPUT')
    expect(userFindFirst).toHaveBeenCalledWith({
      where: { username: { equals: 'TAKEN', mode: 'insensitive' }, NOT: { id: 't1' } },
      select: { id: true },
    })
    expectNoWrites()
  })

  it('rejects a reserved username and writes nothing', async () => {
    const err = await rejection(adminUpdateUser({}, { userId: 't1', username: 'Admin' }, boss))
    expect(err.extensions.code).toBe('BAD_USER_INPUT')
    expectNoWrites()
  })

  it('rejects an empty username and writes nothing', async () => {
    const err = await rejection(adminUpdateUser({}, { userId: 't1', username: '  ' }, boss))
    expect(err.extensions.code).toBe('BAD_USER_INPUT')
    expectNoWrites()
  })

  it('changes the display name, trimmed, and records it in the diff', async () => {
    await adminUpdateUser({}, { userId: 't1', name: '  New Name  ' }, boss)
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { name: 'New Name' } })
    expect(auditCreate.mock.calls[0][0].data.details).toEqual({
      changes: { name: { from: 'Old Name', to: 'New Name' } },
    })
  })

  it('accepts a name of exactly LIMITS.displayName and rejects one longer', async () => {
    await adminUpdateUser({}, { userId: 't1', name: 'n'.repeat(LIMITS.displayName) }, boss)
    expect(userUpdate).toHaveBeenCalledTimes(1)
    userUpdate.mockClear()
    auditCreate.mockClear()
    transaction.mockClear()
    const err = await rejection(adminUpdateUser({}, { userId: 't1', name: 'n'.repeat(LIMITS.displayName + 1) }, boss))
    expect(err.extensions.code).toBe('BAD_USER_INPUT')
    expectNoWrites()
  })

  it('rejects a name with control characters and writes nothing', async () => {
    const err = await rejection(adminUpdateUser({}, { userId: 't1', name: 'bad\u0000name' }, boss))
    expect(err.extensions.code).toBe('BAD_USER_INPUT')
    expectNoWrites()
  })

  it.each(['', '   '])('clears the name (sets null) for %j', async (blank) => {
    await adminUpdateUser({}, { userId: 't1', name: blank }, boss)
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { name: null } })
    expect(auditCreate.mock.calls[0][0].data.details).toEqual({
      changes: { name: { from: 'Old Name', to: null } },
    })
  })

  it('changes external crews, cleaned', async () => {
    await adminUpdateUser({}, { userId: 't1', externalCrews: [' Crew B ', 'crew b', ''] }, boss)
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { externalCrews: ['Crew B'] } })
    expect(auditCreate.mock.calls[0][0].data.details).toEqual({
      changes: { externalCrews: { from: ['Crew A'], to: ['Crew B'] } },
    })
  })

  it('rejects an invalid crew list and writes nothing', async () => {
    const err = await rejection(adminUpdateUser({}, { userId: 't1', externalCrews: ['x'.repeat(LIMITS.crewName + 1)] }, boss))
    expect(err.extensions.code).toBe('BAD_USER_INPUT')
    expectNoWrites()
  })

  it('removeAvatar: true sets image to null and records it', async () => {
    await adminUpdateUser({}, { userId: 't1', removeAvatar: true }, boss)
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { image: null } })
    expect(auditCreate.mock.calls[0][0].data.details).toEqual({
      changes: { image: { from: 'https://cdn.example.com/a.png', to: null } },
    })
  })

  it('removeAvatar: false or omitted leaves the image alone', async () => {
    await adminUpdateUser({}, { userId: 't1', removeAvatar: false }, boss)
    expectNoWrites()
  })

  it('applies several changes in one update and one audit entry', async () => {
    await adminUpdateUser({}, { userId: 't1', username: 'newname', name: 'Z', externalCrews: [], removeAvatar: true }, boss)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { username: 'newname', name: 'Z', externalCrews: [], image: null },
    })
    expect(Object.keys(auditCreate.mock.calls[0][0].data.details.changes).sort()).toEqual(
      ['externalCrews', 'image', 'name', 'username'],
    )
  })

  it('writes only the fields that actually changed', async () => {
    await adminUpdateUser({}, { userId: 't1', username: 'oldname', name: 'Z', externalCrews: ['Crew A'] }, boss)
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { name: 'Z' } })
    expect(auditCreate.mock.calls[0][0].data.details).toEqual({
      changes: { name: { from: 'Old Name', to: 'Z' } },
    })
  })

  it('writes no update and no audit entry when nothing changes, but still returns the row', async () => {
    const row = await adminUpdateUser(
      {},
      { userId: 't1', username: 'oldname', name: 'Old Name', externalCrews: ['Crew A'], removeAvatar: false },
      boss,
    )
    expectNoWrites()
    expect(row.id).toBe('t1')
  })

  it('writes nothing when no fields are supplied', async () => {
    await adminUpdateUser({}, { userId: 't1' }, boss)
    expectNoWrites()
  })

  it('fails closed (no user write) when the actor email is missing from the context', async () => {
    const err = await rejection(adminUpdateUser({}, { userId: 't1', name: 'Z' }, { ...boss, email: undefined }))
    expect(err.message).toBe('audit: actor email missing')
    expectNoWrites()
  })
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSuspendUser = adminMutation.adminSuspendUser as (...args: any[]) => Promise<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminReinstateUser = adminMutation.adminReinstateUser as (...args: any[]) => Promise<any>

const suspendable = (extra: Record<string, unknown> = {}) => ({
  id: 't1',
  role: 'USER',
  username: 'oldname',
  email: 't1@example.com',
  suspendedAt: null,
  suspendedUntil: null,
  suspensionReason: null,
  ...extra,
})

const NOW = new Date('2026-11-15T12:00:00.000Z')
const FUTURE = '2027-01-01T00:00:00.000Z'

describe.each([
  ['adminSuspendUser', (ctx: unknown, id = 't1') => adminSuspendUser({}, { userId: id, reason: 'spam' }, ctx)],
  ['adminReinstateUser', (ctx: unknown, id = 't1') => adminReinstateUser({}, { userId: id }, ctx)],
])('%s access checks (R10)', (_name, run) => {
  beforeEach(() => {
    userFindUnique.mockResolvedValue(suspendable({ suspendedAt: NOW }))
    userFindMany.mockResolvedValue([dbUser('t1')])
  })

  describe('with a nonexistent userId, a caller who is not an admin learns nothing and costs no database read', () => {
    function expectNoDbTouched() {
      expect(userFindUnique).not.toHaveBeenCalled()
      expect(userUpdate).not.toHaveBeenCalled()
      expect(auditCreate).not.toHaveBeenCalled()
      expect(transaction).not.toHaveBeenCalled()
    }

    beforeEach(() => {
      userFindUnique.mockResolvedValue(null)
    })

    it('anonymous: UNAUTHENTICATED, not NOT_FOUND', async () => {
      const err = await rejection(run(anonymous, 'nope'))
      expect(err.extensions.code).toBe('UNAUTHENTICATED')
      expectNoDbTouched()
    })

    it('USER: FORBIDDEN, not NOT_FOUND', async () => {
      const err = await rejection(run(asUser, 'nope'))
      expect(err.extensions.code).toBe('FORBIDDEN')
      expectNoDbTouched()
    })

    it('suspended ADMIN: FORBIDDEN, not NOT_FOUND', async () => {
      const err = await rejection(run({ ...boss, suspension: { reason: 'spam', until: null } }, 'nope'))
      expect(err.extensions.code).toBe('FORBIDDEN')
      expectNoDbTouched()
    })

    it('ADMIN: NOT_FOUND', async () => {
      const err = await rejection(run(boss, 'nope'))
      expect(err.extensions.code).toBe('NOT_FOUND')
      expectNoWrites()
    })
  })

  it('rejects an anonymous caller with UNAUTHENTICATED and writes nothing', async () => {
    const err = await rejection(run(anonymous))
    expect(err.extensions.code).toBe('UNAUTHENTICATED')
    expectNoWrites()
  })

  it('rejects a USER caller with FORBIDDEN and writes nothing', async () => {
    const err = await rejection(run(asUser))
    expect(err.extensions.code).toBe('FORBIDDEN')
    expectNoWrites()
  })

  it.each(['ADMIN', 'OWNER'])('rejects an ADMIN acting on a %s with FORBIDDEN and writes nothing', async (role) => {
    userFindUnique.mockResolvedValue(suspendable({ role, suspendedAt: NOW }))
    const err = await rejection(run(boss))
    expect(err.extensions.code).toBe('FORBIDDEN')
    expectNoWrites()
  })

  it('rejects an OWNER acting on the OWNER with FORBIDDEN and writes nothing', async () => {
    userFindUnique.mockResolvedValue(suspendable({ id: 'own', role: 'OWNER', suspendedAt: NOW }))
    const err = await rejection(run(owner, 'own'))
    expect(err.extensions.code).toBe('FORBIDDEN')
    expectNoWrites()
  })

  it('lets an OWNER act on an ADMIN', async () => {
    userFindUnique.mockResolvedValue(suspendable({ role: 'ADMIN', suspendedAt: NOW }))
    await run(owner)
    expect(userUpdate).toHaveBeenCalledTimes(1)
  })
})

describe('adminSuspendUser', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    userFindUnique.mockResolvedValue(suspendable())
    userFindMany.mockResolvedValue([dbUser('t1')])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers both mutations', () => {
    expect(Object.keys(adminMutation)).toEqual(expect.arrayContaining(['adminSuspendUser', 'adminReinstateUser']))
  })

  it('loads the target with the fields it needs', async () => {
    await adminSuspendUser({}, { userId: 't1', reason: 'spam' }, boss)
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: 't1' },
      select: {
        id: true,
        role: true,
        username: true,
        email: true,
        suspendedAt: true,
        suspendedUntil: true,
        suspensionReason: true,
      },
    })
  })

  it('suspends with no end date and writes the update and USER_SUSPEND audit entry in ONE transaction', async () => {
    await adminSuspendUser({}, { userId: 't1', reason: '  spamming  ' }, boss)
    expect(transaction).toHaveBeenCalledTimes(1)
    const ops = transaction.mock.calls[0][0]
    expect(ops).toHaveLength(2)
    expect(ops[0].op).toBe('user.update')
    expect(ops[1].op).toBe('adminAuditLog.create')
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { suspendedAt: NOW, suspendedUntil: null, suspensionReason: 'spamming' },
    })
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        actorId: 'adm',
        actorUsername: 'boss',
        actorEmail: 'boss@example.com',
        action: 'USER_SUSPEND',
        targetType: 'USER',
        targetId: 't1',
        targetUsername: 'oldname',
        targetEmail: 't1@example.com',
        details: { reason: 'spamming', until: null },
      },
    })
  })

  it('stores the end date as a Date and logs it as an ISO string', async () => {
    await adminSuspendUser({}, { userId: 't1', reason: 'spam', until: FUTURE }, boss)
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { suspendedAt: NOW, suspendedUntil: new Date(FUTURE), suspensionReason: 'spam' },
    })
    expect(auditCreate.mock.calls[0][0].data.details).toEqual({ reason: 'spam', until: FUTURE })
  })

  it('returns the refreshed admin row from loadAdminUserRows', async () => {
    const row = await adminSuspendUser({}, { userId: 't1', reason: 'spam' }, boss)
    expect(userFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['t1'] } } }))
    expect(row.id).toBe('t1')
  })

  it('lets an OWNER suspend an ADMIN and records the ADMIN target', async () => {
    userFindUnique.mockResolvedValue(suspendable({ id: 'a2', role: 'ADMIN' }))
    await adminSuspendUser({}, { userId: 'a2', reason: 'abuse' }, owner)
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'a2' },
      data: { suspendedAt: NOW, suspendedUntil: null, suspensionReason: 'abuse' },
    })
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({ actorId: 'own', targetId: 'a2', action: 'USER_SUSPEND' })
  })

  it.each([
    ['a blank reason', { reason: '   ' }],
    ['a missing-content reason', { reason: '' }],
    ['a 501-character reason', { reason: 'r'.repeat(501) }],
    ['a reason with control characters', { reason: 'bad\u0000reason' }],
    ['a past end date', { reason: 'spam', until: '2020-01-01T00:00:00.000Z' }],
    ['an end date of exactly now', { reason: 'spam', until: NOW.toISOString() }],
    ['an unparseable end date', { reason: 'spam', until: 'not a date' }],
  ])('rejects %s with BAD_USER_INPUT and writes nothing', async (_label, args) => {
    const err = await rejection(adminSuspendUser({}, { userId: 't1', ...args }, boss))
    expect(err.extensions.code).toBe('BAD_USER_INPUT')
    expectNoWrites()
  })

  it('accepts a reason of exactly 500 characters', async () => {
    await adminSuspendUser({}, { userId: 't1', reason: 'r'.repeat(500) }, boss)
    expect(userUpdate).toHaveBeenCalledTimes(1)
  })

  it('checks permission before validating input: a USER with a bad reason gets FORBIDDEN', async () => {
    const err = await rejection(adminSuspendUser({}, { userId: 't1', reason: '' }, asUser))
    expect(err.extensions.code).toBe('FORBIDDEN')
  })

  it('replaces the reason and date of someone already suspended and logs again', async () => {
    userFindUnique.mockResolvedValue(
      suspendable({ suspendedAt: new Date('2026-11-01T00:00:00.000Z'), suspendedUntil: null, suspensionReason: 'old' }),
    )
    await adminSuspendUser({}, { userId: 't1', reason: 'new reason', until: FUTURE }, boss)
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { suspendedAt: NOW, suspendedUntil: new Date(FUTURE), suspensionReason: 'new reason' },
    })
    expect(auditCreate).toHaveBeenCalledTimes(1)
    expect(auditCreate.mock.calls[0][0].data.action).toBe('USER_SUSPEND')
  })

  it('fails closed (no user write) when the actor email is missing from the context', async () => {
    const err = await rejection(adminSuspendUser({}, { userId: 't1', reason: 'spam' }, { ...boss, email: undefined }))
    expect(err.message).toBe('audit: actor email missing')
    expectNoWrites()
  })
})

describe('adminReinstateUser', () => {
  const clear = { suspendedAt: null, suspendedUntil: null, suspensionReason: null }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    userFindUnique.mockResolvedValue(
      suspendable({ suspendedAt: new Date('2026-11-01T00:00:00.000Z'), suspensionReason: 'spam' }),
    )
    userFindMany.mockResolvedValue([dbUser('t1')])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears all three fields and writes USER_REINSTATE in ONE transaction', async () => {
    await adminReinstateUser({}, { userId: 't1' }, boss)
    expect(transaction).toHaveBeenCalledTimes(1)
    const ops = transaction.mock.calls[0][0]
    expect(ops).toHaveLength(2)
    expect(ops[0].op).toBe('user.update')
    expect(ops[1].op).toBe('adminAuditLog.create')
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: clear })
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        actorId: 'adm',
        actorUsername: 'boss',
        actorEmail: 'boss@example.com',
        action: 'USER_REINSTATE',
        targetType: 'USER',
        targetId: 't1',
        targetUsername: 'oldname',
        targetEmail: 't1@example.com',
        details: { previousReason: 'spam', previousUntil: null },
      },
    })
  })

  it('records the previous end date as an ISO string', async () => {
    userFindUnique.mockResolvedValue(
      suspendable({
        suspendedAt: new Date('2026-11-01T00:00:00.000Z'),
        suspendedUntil: new Date(FUTURE),
        suspensionReason: 'spam',
      }),
    )
    await adminReinstateUser({}, { userId: 't1' }, boss)
    expect(auditCreate.mock.calls[0][0].data.details).toEqual({ previousReason: 'spam', previousUntil: FUTURE })
  })

  it('returns the refreshed admin row from loadAdminUserRows', async () => {
    const row = await adminReinstateUser({}, { userId: 't1' }, boss)
    expect(userFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['t1'] } } }))
    expect(row.id).toBe('t1')
  })

  it('is a complete no-op for a user who was never suspended: no write, no audit entry, still returns the row', async () => {
    userFindUnique.mockResolvedValue(suspendable())
    const row = await adminReinstateUser({}, { userId: 't1' }, boss)
    expectNoWrites()
    expect(row.id).toBe('t1')
  })

  // Decision: an expired suspension is "not suspended right now", so reinstating is not an
  // action worth auditing. The stale fields are still cleared (so the row reads clean), but
  // silently: one plain user.update, no transaction and no audit entry.
  it('clears the stale fields of an EXPIRED suspension silently, with no audit entry', async () => {
    userFindUnique.mockResolvedValue(
      suspendable({
        suspendedAt: new Date('2026-10-01T00:00:00.000Z'),
        suspendedUntil: new Date('2026-11-01T00:00:00.000Z'),
        suspensionReason: 'old',
      }),
    )
    const row = await adminReinstateUser({}, { userId: 't1' }, boss)
    expect(userUpdate).toHaveBeenCalledTimes(1)
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: clear })
    expect(auditCreate).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
    expect(row.id).toBe('t1')
  })

  it('fails closed (no user write) when the actor email is missing from the context', async () => {
    const err = await rejection(adminReinstateUser({}, { userId: 't1' }, { ...boss, email: undefined }))
    expect(err.message).toBe('audit: actor email missing')
    expectNoWrites()
  })
})
