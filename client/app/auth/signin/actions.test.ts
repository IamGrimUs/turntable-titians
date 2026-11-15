import { describe, it, expect, vi, beforeEach } from 'vitest'

const signIn = vi.fn()
vi.mock('@/auth', () => ({ signIn: (...a: unknown[]) => signIn(...a) }))
vi.mock('next-auth', () => ({ AuthError: class AuthError extends Error {} }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.5' }) }))
vi.mock('@/lib/db', () => ({ db: {} }))

const checkSignIn = vi.fn()
vi.mock('@/lib/signin-limits', async (orig) => {
  const real = await orig<typeof import('@/lib/signin-limits')>()
  return { ...real, checkSignIn: (...a: unknown[]) => checkSignIn(...a) }
})

import { sendMagicLink } from './actions'

const form = (email: string) => {
  const f = new FormData()
  f.set('email', email)
  return f
}

beforeEach(() => {
  signIn.mockReset()
  checkSignIn.mockReset()
})

describe('sendMagicLink', () => {
  it('asks Auth.js to send the link when the person is not over the limit', async () => {
    checkSignIn.mockResolvedValue({ allowed: true })
    await sendMagicLink(undefined, form('person@example.com'))
    expect(signIn).toHaveBeenCalledWith('resend', { email: 'person@example.com', redirectTo: '/' })
  })

  it('only PEEKS at the limit here (the real counting happens where the email is sent, so it is not counted twice)', async () => {
    checkSignIn.mockResolvedValue({ allowed: true })
    await sendMagicLink(undefined, form('person@example.com'))
    expect(checkSignIn).toHaveBeenCalledWith(
      expect.anything(),
      { email: 'person@example.com', ip: '203.0.113.5', mode: 'peek' }
    )
  })

  it('shows how long to wait, and does not start a sign-in, when over the limit', async () => {
    checkSignIn.mockResolvedValue({ allowed: false, reason: 'email', retryAfterSeconds: 600 })
    const result = await sendMagicLink(undefined, form('person@example.com'))
    expect(result?.error).toMatch(/10 minutes/)
    expect(signIn).not.toHaveBeenCalled()
  })
})
