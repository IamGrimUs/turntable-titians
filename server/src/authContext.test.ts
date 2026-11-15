import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    user: { findUnique: vi.fn() },
  },
}))

import { SignJWT } from 'jose'
import type { Request } from 'express'
import { db } from './db'
import { createAuthContext } from './authContext'

const findUnique = db.user.findUnique as unknown as ReturnType<typeof vi.fn>

const secret = new TextEncoder().encode('test-secret-test-secret-test-secret')
const getAuthContext = createAuthContext({ secret, getClientIp: () => '1.2.3.4' })

const row = {
  role: 'USER',
  username: 'djtest',
  email: 'dj@example.com',
  suspendedAt: null,
  suspendedUntil: null,
  suspensionReason: null,
}

async function token(opts: { expiresIn?: string; key?: Uint8Array } = {}) {
  return new SignJWT({ userId: 'u1' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(opts.expiresIn ?? '1h')
    .sign(opts.key ?? secret)
}

const reqWith = (authorization?: string) => ({ headers: authorization ? { authorization } : {} }) as unknown as Request

// Braces matter: a function returned from beforeEach is run by vitest as a cleanup.
beforeEach(() => {
  findUnique.mockReset()
})

describe('getAuthContext', () => {
  it('returns the viewer with userId and ip for a valid token', async () => {
    findUnique.mockResolvedValue(row)
    expect(await getAuthContext(reqWith(`Bearer ${await token()}`))).toEqual({
      userId: 'u1',
      role: 'USER',
      username: 'djtest',
      email: 'dj@example.com',
      suspension: null,
      ip: '1.2.3.4',
    })
  })

  it('is anonymous without a token and does not touch the database', async () => {
    expect(await getAuthContext(reqWith())).toEqual({ userId: null, ip: '1.2.3.4' })
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('is anonymous for an invalid or expired token', async () => {
    const wrongKey = new TextEncoder().encode('another-secret-another-secret-123')
    expect(await getAuthContext(reqWith(`Bearer ${await token({ key: wrongKey })}`))).toEqual({ userId: null, ip: '1.2.3.4' })
    expect(await getAuthContext(reqWith(`Bearer ${await token({ expiresIn: '-1h' })}`))).toEqual({ userId: null, ip: '1.2.3.4' })
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('is anonymous when the user row has been deleted', async () => {
    findUnique.mockResolvedValue(null)
    expect(await getAuthContext(reqWith(`Bearer ${await token()}`))).toEqual({ userId: null, ip: '1.2.3.4' })
  })

  describe('when the viewer cannot be loaded', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => {
      errorSpy.mockRestore()
    })

    it('fails closed as anonymous (ip kept), logs the error and does not throw', async () => {
      const boom = new Error('connection pool exhausted')
      findUnique.mockRejectedValue(boom)
      expect(await getAuthContext(reqWith(`Bearer ${await token()}`))).toEqual({ userId: null, ip: '1.2.3.4' })
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy.mock.calls[0][0]).toContain('[context] could not load the viewer')
      expect(errorSpy.mock.calls[0][1]).toBe(boom)
    })
  })
})
