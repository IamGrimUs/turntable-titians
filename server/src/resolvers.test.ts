import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    vote: { findFirst: vi.fn() },
  },
}))

import { db } from './db'
import { resolvers } from './resolvers'

const findFirst = db.vote.findFirst as unknown as ReturnType<typeof vi.fn>
const parent = { id: 'sub-1' } as never

describe('Submission.viewerHasVoted', () => {
  beforeEach(() => findFirst.mockReset())

  it('is false for anonymous callers and does not touch the database', async () => {
    const result = await resolvers.Submission.viewerHasVoted(parent, {}, { userId: null })
    expect(result).toBe(false)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('is true when the caller has a vote on this submission', async () => {
    findFirst.mockResolvedValue({ id: 'vote-1' })
    const result = await resolvers.Submission.viewerHasVoted(parent, {}, { userId: 'user-1' })
    expect(result).toBe(true)
    expect(findFirst).toHaveBeenCalledWith({
      where: { submissionId: 'sub-1', userId: 'user-1' },
      select: { id: true },
    })
  })

  it('is false when the caller has not voted on this submission', async () => {
    findFirst.mockResolvedValue(null)
    const result = await resolvers.Submission.viewerHasVoted(parent, {}, { userId: 'user-1' })
    expect(result).toBe(false)
  })

  it('only ever looks up the caller\'s own vote, never another user\'s', async () => {
    findFirst.mockResolvedValue(null)
    await resolvers.Submission.viewerHasVoted(parent, {}, { userId: 'user-1' })
    expect(findFirst.mock.calls[0][0].where.userId).toBe('user-1')
  })
})

describe('Submission resolvers', () => {
  it('no longer has a votes resolver', () => {
    expect('votes' in resolvers.Submission).toBe(false)
  })
})
