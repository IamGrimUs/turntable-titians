import { describe, it, expect, vi } from 'vitest'
import { refreshRoleIntoToken } from './session-role'

const MIN = 60 * 1000

const row = (
  role: 'USER' | 'ADMIN' | 'OWNER',
  suspendedAt: Date | null = null,
  suspendedUntil: Date | null = null
) => ({ role, suspendedAt, suspendedUntil, username: 'dj_fox', image: null as string | null })

describe('refreshRoleIntoToken', () => {
  it('skips the load while the role is fresh', async () => {
    const load = vi.fn()
    const token = { id: 'u1', role: 'ADMIN', roleCheckedAt: 1000 }
    await refreshRoleIntoToken(token, load, 1000 + 4 * MIN)
    expect(load).not.toHaveBeenCalled()
    expect(token.role).toBe('ADMIN')
  })

  it('reloads when the role is stale', async () => {
    const load = vi.fn().mockResolvedValue(row('USER'))
    const token = { id: 'u1', role: 'ADMIN', roleCheckedAt: 1000 }
    await refreshRoleIntoToken(token, load, 1000 + 6 * MIN)
    expect(load).toHaveBeenCalledWith('u1')
    expect(token.role).toBe('USER')
    expect(token.roleCheckedAt).toBe(1000 + 6 * MIN)
  })

  it('reloads when the role is missing', async () => {
    const load = vi.fn().mockResolvedValue(row('OWNER'))
    const token: { id: string; role?: unknown; roleCheckedAt?: unknown } = { id: 'u1' }
    await refreshRoleIntoToken(token, load, 5000)
    expect(token.role).toBe('OWNER')
    expect(token.roleCheckedAt).toBe(5000)
  })

  it('reloads when there is no check time even if a role is present', async () => {
    const load = vi.fn().mockResolvedValue(row('ADMIN'))
    const token: { id: string; role?: unknown; roleCheckedAt?: unknown } = { id: 'u1', role: 'USER' }
    await refreshRoleIntoToken(token, load, 5000)
    expect(load).toHaveBeenCalled()
    expect(token.role).toBe('ADMIN')
  })

  it('honours a custom max age', async () => {
    const load = vi.fn().mockResolvedValue(row('USER'))
    const token = { id: 'u1', role: 'ADMIN', roleCheckedAt: 0 }
    await refreshRoleIntoToken(token, load, 2000, 1000)
    expect(load).toHaveBeenCalled()
  })

  it('keeps the old role and logs when load throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const load = vi.fn().mockRejectedValue(new Error('db down'))
    const token = { id: 'u1', role: 'ADMIN', roleCheckedAt: 0 }
    await refreshRoleIntoToken(token, load, 10 * MIN)
    expect(token.role).toBe('ADMIN')
    expect(token.roleCheckedAt).toBe(0)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('ends the session (returns null) when the row is gone', async () => {
    const load = vi.fn().mockResolvedValue(null)
    const token = { id: 'u1', role: 'ADMIN', roleCheckedAt: 0 }
    expect(await refreshRoleIntoToken(token, load, 10 * MIN)).toBeNull()
  })

  it('ends the session while the user is suspended (open-ended)', async () => {
    const load = vi.fn().mockResolvedValue(row('USER', new Date(0), null))
    const token = { id: 'u1', role: 'USER', roleCheckedAt: 0 }
    expect(await refreshRoleIntoToken(token, load, 10 * MIN)).toBeNull()
  })

  it('ends the session while a timed suspension has not run out', async () => {
    const load = vi.fn().mockResolvedValue(row('USER', new Date(0), new Date(11 * MIN)))
    const token = { id: 'u1', role: 'USER', roleCheckedAt: 0 }
    expect(await refreshRoleIntoToken(token, load, 10 * MIN)).toBeNull()
  })

  it('keeps the session once the suspension has expired', async () => {
    const load = vi.fn().mockResolvedValue(row('USER', new Date(0), new Date(9 * MIN)))
    const token = { id: 'u1', role: 'USER', roleCheckedAt: 0 }
    expect(await refreshRoleIntoToken(token, load, 10 * MIN)).toBe(token)
    expect(token.roleCheckedAt).toBe(10 * MIN)
  })

  it('keeps the session and the old role when the lookup throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const load = vi.fn().mockRejectedValue(new Error('db down'))
    const token = { id: 'u1', role: 'ADMIN', roleCheckedAt: 0 }
    expect(await refreshRoleIntoToken(token, load, 10 * MIN)).toBe(token)
    expect(token.role).toBe('ADMIN')
    spy.mockRestore()
  })

  it('does not load for a fresh token, so a suspended user is only cut off at the next refresh', async () => {
    const load = vi.fn()
    const token = { id: 'u1', role: 'USER', roleCheckedAt: 0 }
    expect(await refreshRoleIntoToken(token, load, 1 * MIN)).toBe(token)
    expect(load).not.toHaveBeenCalled()
  })

  it('keeps a normal fresh sign-in (no check time yet, active user)', async () => {
    const load = vi.fn().mockResolvedValue(row('USER'))
    const token: { id: string; role?: unknown; roleCheckedAt?: unknown } = { id: 'u1' }
    expect(await refreshRoleIntoToken(token, load, 5000)).toBe(token)
    expect(token.role).toBe('USER')
  })

  describe('username and avatar', () => {
    it('copies the stored username and avatar into the token on a refresh', async () => {
      const load = vi.fn().mockResolvedValue({ ...row('USER'), username: 'new_name', image: 'https://cdn.example/a/new.png' })
      const token = { id: 'u1', role: 'USER', roleCheckedAt: 0, username: 'old_name', picture: 'https://cdn.example/a/old.png' }
      await refreshRoleIntoToken(token, load, 10 * MIN)
      expect(token.username).toBe('new_name')
      expect(token.picture).toBe('https://cdn.example/a/new.png')
    })

    it('clears the avatar in the token when the profile no longer has one', async () => {
      const load = vi.fn().mockResolvedValue({ ...row('USER'), image: null })
      const token = { id: 'u1', role: 'USER', roleCheckedAt: 0, picture: 'https://cdn.example/a/old.png' }
      await refreshRoleIntoToken(token, load, 10 * MIN)
      expect(token.picture).toBeNull()
    })

    it('leaves them alone while the role is still fresh', async () => {
      const load = vi.fn()
      const token = { id: 'u1', role: 'USER', roleCheckedAt: 0, username: 'old_name', picture: 'https://cdn.example/a/old.png' }
      await refreshRoleIntoToken(token, load, 1 * MIN)
      expect(load).not.toHaveBeenCalled()
      expect(token.username).toBe('old_name')
      expect(token.picture).toBe('https://cdn.example/a/old.png')
    })

    it('keeps the old values when the lookup fails', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const load = vi.fn().mockRejectedValue(new Error('db down'))
      const token = { id: 'u1', role: 'USER', roleCheckedAt: 0, username: 'old_name', picture: 'https://cdn.example/a/old.png' }
      await refreshRoleIntoToken(token, load, 10 * MIN)
      expect(token.username).toBe('old_name')
      expect(token.picture).toBe('https://cdn.example/a/old.png')
      spy.mockRestore()
    })

    it('does not touch them for a suspended user, whose session ends', async () => {
      const load = vi.fn().mockResolvedValue({ ...row('USER', new Date(0), null), image: 'https://cdn.example/a/new.png' })
      const token = { id: 'u1', role: 'USER', roleCheckedAt: 0, picture: 'https://cdn.example/a/old.png' }
      expect(await refreshRoleIntoToken(token, load, 10 * MIN)).toBeNull()
      expect(token.picture).toBe('https://cdn.example/a/old.png')
    })
  })

  it('ignores a token without a string id', async () => {
    const load = vi.fn()
    const token: { id?: unknown; role?: unknown } = { id: 42 }
    await refreshRoleIntoToken(token, load, 5000)
    expect(load).not.toHaveBeenCalled()
    expect(token.role).toBeUndefined()
  })
})
