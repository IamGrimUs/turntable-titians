import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const authMock = vi.fn()
vi.mock('@/auth', () => ({ auth: () => authMock() }))

const findUnique = vi.fn()
vi.mock('@/lib/db', () => ({ db: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }))

const send = vi.fn()
vi.mock('@/lib/r2', async (orig) => {
  const real = await orig<typeof import('@/lib/r2')>()
  return { ...real, getR2Client: () => ({ send }) }
})

import { POST } from './route'

const ENV = {
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'k'.repeat(32),
  R2_SECRET_ACCESS_KEY: 's'.repeat(64),
  R2_BUCKET_NAME: 'bucket',
  NEXT_PUBLIC_R2_PUBLIC_URL: 'https://cdn.example.com',
}
// The same mock serves the active-user check and the image lookup.
const ACTIVE = { suspendedAt: null, suspendedUntil: null }
const old = new Date(Date.now() - 24 * 3600 * 1000)
const fresh = new Date(Date.now() - 60 * 1000)

function listing(...objs: { Key: string; LastModified: Date }[]) {
  return { Contents: objs, IsTruncated: false }
}

/** Commands passed to send(), as [name, input] pairs. */
function sent() {
  return send.mock.calls.map(([cmd]) => [cmd.constructor.name, cmd.input] as const)
}
const deletedKeys = () => sent().filter(([n]) => n === 'DeleteObjectCommand').map(([, i]) => (i as { Key: string }).Key)

beforeEach(() => {
  send.mockReset()
  findUnique.mockReset()
  authMock.mockResolvedValue({ user: { id: 'user-abc' } })
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
})
afterEach(() => vi.unstubAllEnvs())

// The route accepts no request input at all: who and what to delete come from the session and database.
const call = () => POST()

describe('POST /api/avatar/cleanup', () => {
  it('returns 401 and touches nothing when not signed in', async () => {
    authMock.mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(401)
    expect(send).not.toHaveBeenCalled()
  })

  it('returns 401 and touches nothing for a suspended user', async () => {
    findUnique.mockResolvedValue({ image: null, suspendedAt: new Date('2026-01-01'), suspendedUntil: null })
    const res = await call()
    expect(res.status).toBe(401)
    expect(send).not.toHaveBeenCalled()
  })

  it('returns 401 and touches nothing when the user no longer exists', async () => {
    findUnique.mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(401)
    expect(send).not.toHaveBeenCalled()
  })

  it('deletes old avatars but keeps the one the profile currently uses', async () => {
    findUnique.mockResolvedValue({ image: 'https://cdn.example.com/avatars/user-abc/current.png', ...ACTIVE })
    send.mockImplementation(async (cmd: { constructor: { name: string } }) =>
      cmd.constructor.name === 'ListObjectsV2Command'
        ? listing(
            { Key: 'avatars/user-abc/old-1.png', LastModified: old },
            { Key: 'avatars/user-abc/current.png', LastModified: old },
            { Key: 'avatars/user-abc/old-2.webp', LastModified: old },
          )
        : {}
    )
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 2 })
    expect(deletedKeys().sort()).toEqual(['avatars/user-abc/old-1.png', 'avatars/user-abc/old-2.webp'])
  })

  it('only ever lists the caller\'s own folder, and takes no input from the request', async () => {
    findUnique.mockResolvedValue({ image: null, ...ACTIVE })
    send.mockResolvedValue(listing())
    await call()
    const [name, input] = sent()[0]
    expect(name).toBe('ListObjectsV2Command')
    expect((input as { Prefix: string }).Prefix).toBe('avatars/user-abc/')
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'user-abc' }, select: { image: true } })
  })

  it('does not delete uploads that are only minutes old', async () => {
    findUnique.mockResolvedValue({ image: 'https://cdn.example.com/avatars/user-abc/current.png', ...ACTIVE })
    send.mockImplementation(async (cmd: { constructor: { name: string } }) =>
      cmd.constructor.name === 'ListObjectsV2Command'
        ? listing({ Key: 'avatars/user-abc/just-uploaded.png', LastModified: fresh })
        : {}
    )
    expect(await (await call()).json()).toEqual({ deleted: 0 })
    expect(deletedKeys()).toEqual([])
  })

  it('does not treat the live avatar as stale if the public URL host changed', async () => {
    findUnique.mockResolvedValue({ image: 'https://some-old-host.r2.dev/avatars/user-abc/current.png', ...ACTIVE })
    send.mockImplementation(async (cmd: { constructor: { name: string } }) =>
      cmd.constructor.name === 'ListObjectsV2Command'
        ? listing({ Key: 'avatars/user-abc/current.png', LastModified: old })
        : {}
    )
    await call()
    expect(deletedKeys()).toEqual([])
  })

  it('reports how many deletions actually succeeded and still returns 200 if some fail', async () => {
    findUnique.mockResolvedValue({ image: null, ...ACTIVE })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    send.mockImplementation(async (cmd: { constructor: { name: string }; input: { Key?: string } }) => {
      if (cmd.constructor.name === 'ListObjectsV2Command') {
        return listing(
          { Key: 'avatars/user-abc/a.png', LastModified: old },
          { Key: 'avatars/user-abc/b.png', LastModified: old },
        )
      }
      if (cmd.input.Key?.endsWith('b.png')) throw new Error('boom')
      return {}
    })
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 1 })
    log.mockRestore()
  })

  it('returns a generic 500 and names (not reveals) missing settings', async () => {
    vi.stubEnv('R2_BUCKET_NAME', '')
    findUnique.mockResolvedValue({ image: null, ...ACTIVE })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call()
    expect(res.status).toBe(500)
    expect(log.mock.calls.flat().join(' ')).toContain('R2_BUCKET_NAME')
    expect(send).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('returns 500 without deleting anything if listing fails', async () => {
    findUnique.mockResolvedValue({ image: null, ...ACTIVE })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    send.mockRejectedValue(new Error('R2 down'))
    const res = await call()
    expect(res.status).toBe(500)
    expect(deletedKeys()).toEqual([])
    log.mockRestore()
  })
})
