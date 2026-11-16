import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authMock, findUniqueMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  findUniqueMock: vi.fn(),
  // The real redirect() throws to stop rendering; the mock does the same with a readable sentinel.
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/auth', () => ({ auth: authMock }))
vi.mock('@/lib/db', () => ({ db: { user: { findUnique: findUniqueMock } } }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))

import { requireAdminViewer } from './admin-viewer'

const SIGN_IN = '/auth/signin?callbackUrl=%2Fadmin'
const HOUR = 60 * 60 * 1000

type DbRow = {
  id: string
  role: 'USER' | 'ADMIN' | 'OWNER'
  suspendedAt: Date | null
  suspendedUntil: Date | null
}

const dbRow = (role: DbRow['role'], over: Partial<DbRow> = {}): DbRow => ({
  id: 'u1',
  role,
  suspendedAt: null,
  suspendedUntil: null,
  ...over,
})

// A session whose role getter fails the test if the gate ever reads it.
function sessionWithRoleTrap() {
  const user = { id: 'u1' } as { id: string; role?: string }
  Object.defineProperty(user, 'role', {
    get() {
      throw new Error('session.user.role must not be read for an access decision')
    },
    enumerable: true,
  })
  return { user }
}

describe('requireAdminViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockResolvedValue({ user: { id: 'u1' } })
    findUniqueMock.mockResolvedValue(dbRow('ADMIN'))
  })

  it('sends a signed-out visitor to sign-in without touching the database', async () => {
    authMock.mockResolvedValue(null)
    await expect(requireAdminViewer()).rejects.toThrow(`NEXT_REDIRECT:${SIGN_IN}`)
    expect(findUniqueMock).not.toHaveBeenCalled()
  })

  it('sends a session without a user id to sign-in', async () => {
    authMock.mockResolvedValue({ user: { name: 'No Id' } })
    await expect(requireAdminViewer()).rejects.toThrow(`NEXT_REDIRECT:${SIGN_IN}`)
    expect(findUniqueMock).not.toHaveBeenCalled()
  })

  it('sends home when the user no longer exists', async () => {
    findUniqueMock.mockResolvedValue(null)
    await expect(requireAdminViewer()).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('sends home a user suspended right now, even an admin', async () => {
    findUniqueMock.mockResolvedValue(
      dbRow('ADMIN', { suspendedAt: new Date(Date.now() - HOUR), suspendedUntil: null })
    )
    await expect(requireAdminViewer()).rejects.toThrow('NEXT_REDIRECT:/')

    findUniqueMock.mockResolvedValue(
      dbRow('OWNER', { suspendedAt: new Date(Date.now() - HOUR), suspendedUntil: new Date(Date.now() + HOUR) })
    )
    await expect(requireAdminViewer()).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('lets an admin in once the suspension has expired', async () => {
    findUniqueMock.mockResolvedValue(
      dbRow('ADMIN', { suspendedAt: new Date(Date.now() - 2 * HOUR), suspendedUntil: new Date(Date.now() - HOUR) })
    )
    await expect(requireAdminViewer()).resolves.toEqual({ id: 'u1', role: 'ADMIN' })
  })

  it('sends home a plain user', async () => {
    findUniqueMock.mockResolvedValue(dbRow('USER'))
    await expect(requireAdminViewer()).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('returns the id and role of an admin', async () => {
    await expect(requireAdminViewer()).resolves.toEqual({ id: 'u1', role: 'ADMIN' })
  })

  it('returns the id and role of an owner', async () => {
    findUniqueMock.mockResolvedValue(dbRow('OWNER'))
    await expect(requireAdminViewer()).resolves.toEqual({ id: 'u1', role: 'OWNER' })
  })

  it('looks the user up by the session id and selects only what the gate needs', async () => {
    await requireAdminViewer()
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { id: true, role: true, suspendedAt: true, suspendedUntil: true },
    })
  })

  it('uses the database role when the session hint says more (stale OWNER hint, database USER)', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'OWNER' } })
    findUniqueMock.mockResolvedValue(dbRow('USER'))
    await expect(requireAdminViewer()).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('uses the database role when the session hint says less (stale USER hint, database OWNER)', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'USER' } })
    findUniqueMock.mockResolvedValue(dbRow('OWNER'))
    await expect(requireAdminViewer()).resolves.toEqual({ id: 'u1', role: 'OWNER' })
  })

  it('returns the database role for an admin whose session claims OWNER', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'OWNER' } })
    findUniqueMock.mockResolvedValue(dbRow('ADMIN'))
    await expect(requireAdminViewer()).resolves.toEqual({ id: 'u1', role: 'ADMIN' })
  })

  it('never reads session.user.role', async () => {
    authMock.mockResolvedValue(sessionWithRoleTrap())
    findUniqueMock.mockResolvedValue(dbRow('ADMIN'))
    await expect(requireAdminViewer()).resolves.toEqual({ id: 'u1', role: 'ADMIN' })
  })
})
