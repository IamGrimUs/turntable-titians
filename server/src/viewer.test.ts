import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    user: { findUnique: vi.fn() },
  },
}))

import { db } from './db'
import { loadViewer } from './viewer'

const findUnique = db.user.findUnique as unknown as ReturnType<typeof vi.fn>

beforeEach(() => findUnique.mockReset())

const now = new Date('2026-11-15T12:00:00Z')
const row = {
  role: 'USER',
  username: 'djtest',
  email: 'dj@example.com',
  suspendedAt: null,
  suspendedUntil: null,
  suspensionReason: null,
}

describe('loadViewer', () => {
  it('returns role, username and email with no suspension for an active user', async () => {
    findUnique.mockResolvedValue(row)
    expect(await loadViewer('u1', now)).toEqual({
      userId: 'u1',
      role: 'USER',
      username: 'djtest',
      email: 'dj@example.com',
      suspension: null,
    })
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }))
  })

  it('returns the suspension when the user is suspended right now', async () => {
    const until = new Date('2026-12-01T00:00:00Z')
    findUnique.mockResolvedValue({
      ...row,
      suspendedAt: new Date('2026-11-10T00:00:00Z'),
      suspendedUntil: until,
      suspensionReason: 'spam',
    })
    const viewer = await loadViewer('u1', now)
    expect(viewer?.suspension).toEqual({ reason: 'spam', until })
  })

  it('returns an open-ended suspension with until null', async () => {
    findUnique.mockResolvedValue({
      ...row,
      suspendedAt: new Date('2026-11-10T00:00:00Z'),
      suspensionReason: 'abuse',
    })
    const viewer = await loadViewer('u1', now)
    expect(viewer?.suspension).toEqual({ reason: 'abuse', until: null })
  })

  it('returns suspension null when the suspension has expired', async () => {
    findUnique.mockResolvedValue({
      ...row,
      suspendedAt: new Date('2026-11-01T00:00:00Z'),
      suspendedUntil: new Date('2026-11-10T00:00:00Z'),
      suspensionReason: 'spam',
    })
    const viewer = await loadViewer('u1', now)
    expect(viewer?.suspension).toBeNull()
  })

  it('returns null when the user row is gone', async () => {
    findUnique.mockResolvedValue(null)
    expect(await loadViewer('missing', now)).toBeNull()
  })
})
