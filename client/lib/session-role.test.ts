import { describe, it, expect, vi } from 'vitest'
import { refreshRoleIntoToken } from './session-role'

const MIN = 60 * 1000

describe('refreshRoleIntoToken', () => {
  it('skips the load while the role is fresh', async () => {
    const load = vi.fn()
    const token = { id: 'u1', role: 'ADMIN', roleCheckedAt: 1000 }
    await refreshRoleIntoToken(token, load, 1000 + 4 * MIN)
    expect(load).not.toHaveBeenCalled()
    expect(token.role).toBe('ADMIN')
  })

  it('reloads when the role is stale', async () => {
    const load = vi.fn().mockResolvedValue({ role: 'USER' })
    const token = { id: 'u1', role: 'ADMIN', roleCheckedAt: 1000 }
    await refreshRoleIntoToken(token, load, 1000 + 6 * MIN)
    expect(load).toHaveBeenCalledWith('u1')
    expect(token.role).toBe('USER')
    expect(token.roleCheckedAt).toBe(1000 + 6 * MIN)
  })

  it('reloads when the role is missing', async () => {
    const load = vi.fn().mockResolvedValue({ role: 'OWNER' })
    const token: { id: string; role?: unknown; roleCheckedAt?: unknown } = { id: 'u1' }
    await refreshRoleIntoToken(token, load, 5000)
    expect(token.role).toBe('OWNER')
    expect(token.roleCheckedAt).toBe(5000)
  })

  it('reloads when there is no check time even if a role is present', async () => {
    const load = vi.fn().mockResolvedValue({ role: 'ADMIN' })
    const token: { id: string; role?: unknown; roleCheckedAt?: unknown } = { id: 'u1', role: 'USER' }
    await refreshRoleIntoToken(token, load, 5000)
    expect(load).toHaveBeenCalled()
    expect(token.role).toBe('ADMIN')
  })

  it('honours a custom max age', async () => {
    const load = vi.fn().mockResolvedValue({ role: 'USER' })
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

  it('writes USER when the row is gone', async () => {
    const load = vi.fn().mockResolvedValue(null)
    const token = { id: 'u1', role: 'ADMIN', roleCheckedAt: 0 }
    await refreshRoleIntoToken(token, load, 10 * MIN)
    expect(token.role).toBe('USER')
    expect(token.roleCheckedAt).toBe(10 * MIN)
  })

  it('ignores a token without a string id', async () => {
    const load = vi.fn()
    const token: { id?: unknown; role?: unknown } = { id: 42 }
    await refreshRoleIntoToken(token, load, 5000)
    expect(load).not.toHaveBeenCalled()
    expect(token.role).toBeUndefined()
  })
})
