import { describe, it, expect, vi } from 'vitest'
import { refreshTokenFromProfile } from './session-refresh'

const token = (over: Record<string, unknown> = {}) => ({ id: 'u1', username: 'old', picture: 'https://old.example/a.png', ...over })

describe('refreshTokenFromProfile', () => {
  it('copies the current username and image from the database into the token', async () => {
    const load = vi.fn().mockResolvedValue({ username: 'new_name', image: 'https://cdn.example/avatars/u1/x.png' })
    const t = await refreshTokenFromProfile(token(), load)
    expect(load).toHaveBeenCalledWith('u1')
    expect(t.username).toBe('new_name')
    expect(t.picture).toBe('https://cdn.example/avatars/u1/x.png')
  })

  it('clears the picture when the user has no image any more', async () => {
    const t = await refreshTokenFromProfile(token(), vi.fn().mockResolvedValue({ username: 'x', image: null }))
    expect(t.picture).toBeNull()
  })

  it('leaves the token untouched when the user cannot be found', async () => {
    const t = await refreshTokenFromProfile(token(), vi.fn().mockResolvedValue(null))
    expect(t).toEqual(token())
  })

  it('does nothing, and never queries, when the token has no user id', async () => {
    const load = vi.fn()
    const t = await refreshTokenFromProfile({ username: 'x' }, load)
    expect(load).not.toHaveBeenCalled()
    expect(t).toEqual({ username: 'x' })
  })

  it('keeps the old token (and does not throw) if the database lookup fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const t = await refreshTokenFromProfile(token(), vi.fn().mockRejectedValue(new Error('db down')))
    expect(t).toEqual(token())
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('only ever reads the id from the token, so the browser cannot choose what goes into its own session', async () => {
    const load = vi.fn().mockResolvedValue({ username: 'real', image: null })
    const t = await refreshTokenFromProfile(token({ username: 'attacker-chosen' }), load)
    expect(t.username).toBe('real')
  })
})
