import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    idea: { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), delete: vi.fn() },
    ideaVote: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    ideaComment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    ideaCommentVote: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    // The battle vote model: the board must never touch it.
    vote: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

import { db } from './db'
import { boardMutation } from './boardResolvers'
import { BOARD_LIMITS } from './boardRules'

const fn = (f: unknown) => f as ReturnType<typeof vi.fn>
const ideaFindUnique = fn(db.idea.findUnique)
const ideaFindFirst = fn(db.idea.findFirst)
const ideaCount = fn(db.idea.count)
const ideaCreate = fn(db.idea.create)
const ideaDelete = fn(db.idea.delete)
const ideaVoteFindUnique = fn(db.ideaVote.findUnique)
const ideaVoteCreate = fn(db.ideaVote.create)
const ideaVoteDeleteMany = fn(db.ideaVote.deleteMany)
const commentFindUnique = fn(db.ideaComment.findUnique)
const commentFindFirst = fn(db.ideaComment.findFirst)
const commentCount = fn(db.ideaComment.count)
const commentCreate = fn(db.ideaComment.create)
const commentDelete = fn(db.ideaComment.delete)
const commentVoteFindUnique = fn(db.ideaCommentVote.findUnique)
const commentVoteCreate = fn(db.ideaCommentVote.create)
const commentVoteDeleteMany = fn(db.ideaCommentVote.deleteMany)

/* eslint-disable @typescript-eslint/no-explicit-any */
const m = boardMutation as Record<string, (...args: any[]) => Promise<any>>
/* eslint-enable @typescript-eslint/no-explicit-any */

const anonymous = { userId: null }
const asUser = { userId: 'u1', role: 'USER' as const, username: 'dj_one' }
const asAdmin = { userId: 'adm', role: 'ADMIN' as const, username: 'boss' }
const suspendedUser = { ...asUser, suspension: { reason: 'spam', until: null } }
const noUsername = { userId: 'u1', role: 'USER' as const, username: null }

const date = new Date('2026-01-02T03:04:05.000Z')

function makeIdea(over: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    authorId: 'u9',
    title: 't',
    body: 'b',
    category: 'BUG',
    topic: null,
    status: 'OPEN',
    hiddenAt: null,
    createdAt: date,
    updatedAt: date,
    ...over,
  }
}

/** A comment row as loaded with its idea's hiddenAt (the shape the resolver's lookup returns). */
function makeComment(over: Record<string, unknown> = {}, ideaHiddenAt: Date | null = null) {
  return {
    id: 'c1',
    ideaId: 'i1',
    authorId: 'u9',
    body: 'hi',
    hiddenAt: null,
    createdAt: date,
    idea: { hiddenAt: ideaHiddenAt },
    ...over,
  }
}

const ideaArgs = { title: 'Dark mode', body: 'Please add it', category: 'SUGGESTION' }

/** Every mutation with arguments that pass validation, for the cross-cutting auth tests. */
const calls: Array<[string, Record<string, unknown>]> = [
  ['createIdea', ideaArgs],
  ['deleteIdea', { id: 'i1' }],
  ['voteIdea', { ideaId: 'i1' }],
  ['unvoteIdea', { ideaId: 'i1' }],
  ['createComment', { ideaId: 'i1', body: 'nice' }],
  ['deleteComment', { id: 'c1' }],
  ['voteComment', { commentId: 'c1' }],
  ['unvoteComment', { commentId: 'c1' }],
]

function allWriteMocks() {
  return [
    ideaCreate,
    ideaDelete,
    ideaVoteCreate,
    ideaVoteDeleteMany,
    commentCreate,
    commentDelete,
    commentVoteCreate,
    commentVoteDeleteMany,
  ]
}

const battleVote = db.vote as unknown as Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  vi.clearAllMocks()
  ideaCount.mockResolvedValue(0)
  ideaFindFirst.mockResolvedValue(null)
  ideaFindUnique.mockResolvedValue(makeIdea())
  ideaVoteFindUnique.mockResolvedValue(null)
  ideaVoteCreate.mockResolvedValue({ id: 'v1' })
  ideaVoteDeleteMany.mockResolvedValue({ count: 1 })
  commentCount.mockResolvedValue(0)
  commentFindFirst.mockResolvedValue(null)
  commentFindUnique.mockResolvedValue(makeComment())
  commentVoteFindUnique.mockResolvedValue(null)
  commentVoteCreate.mockResolvedValue({ id: 'cv1' })
  commentVoteDeleteMany.mockResolvedValue({ count: 1 })
  ideaCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    makeIdea({ id: 'new', ...data })
  )
  commentCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const { idea: _idea, ...row } = makeComment({ id: 'newc', ...data })
    return row
  })
})

describe('auth gates (all eight mutations)', () => {
  it.each(calls)('%s refuses an anonymous caller with UNAUTHENTICATED', async (name, args) => {
    await expect(m[name]({}, args, anonymous)).rejects.toMatchObject({
      extensions: { code: 'UNAUTHENTICATED' },
    })
    for (const w of allWriteMocks()) expect(w).not.toHaveBeenCalled()
  })

  it.each(calls)('%s refuses a suspended caller with FORBIDDEN and the suspension message', async (name, args) => {
    await expect(m[name]({}, args, suspendedUser)).rejects.toMatchObject({
      message: expect.stringContaining('suspended'),
      extensions: { code: 'FORBIDDEN' },
    })
    for (const w of allWriteMocks()) expect(w).not.toHaveBeenCalled()
  })

  it.each(calls)('%s refuses a caller with no username with FORBIDDEN', async (name, args) => {
    await expect(m[name]({}, args, noUsername)).rejects.toMatchObject({
      message: 'Choose a username first.',
      extensions: { code: 'FORBIDDEN' },
    })
    for (const w of allWriteMocks()) expect(w).not.toHaveBeenCalled()
  })
})

describe('createIdea', () => {
  it('creates an idea owned by the caller', async () => {
    const out = await m.createIdea({}, ideaArgs, asUser)
    expect(ideaCreate).toHaveBeenCalledWith({
      data: { title: 'Dark mode', body: 'Please add it', category: 'SUGGESTION', topic: null, authorId: 'u1' },
    })
    expect(out.id).toBe('new')
  })

  it('refuses the 6th idea in a day and does not create it', async () => {
    ideaCount.mockResolvedValue(BOARD_LIMITS.ideasPerDay)
    await expect(m.createIdea({}, ideaArgs, asUser)).rejects.toMatchObject({
      message: `You can post up to ${BOARD_LIMITS.ideasPerDay} ideas a day. Try again tomorrow.`,
      extensions: { code: 'BAD_USER_INPUT' },
    })
    expect(ideaCreate).not.toHaveBeenCalled()
  })

  it('counts only the caller own ideas in the last 24 hours', async () => {
    const before = Date.now()
    await m.createIdea({}, ideaArgs, asUser)
    const where = ideaCount.mock.calls[0][0].where
    expect(where.authorId).toBe('u1')
    const since = (where.createdAt.gte as Date).getTime()
    expect(since).toBeLessThanOrEqual(before - 24 * 60 * 60 * 1000 + 1000)
    expect(since).toBeGreaterThan(before - 24 * 60 * 60 * 1000 - 5000)
  })

  it('refuses the same title in another case from the same author', async () => {
    ideaFindFirst.mockResolvedValue({ id: 'old' })
    await expect(m.createIdea({}, { ...ideaArgs, title: 'DARK MODE' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    })
    const where = ideaFindFirst.mock.calls[0][0].where
    expect(where.authorId).toBe('u1')
    expect(where.title).toEqual({ equals: 'DARK MODE', mode: 'insensitive' })
    expect(where.createdAt.gte).toBeInstanceOf(Date)
    expect(ideaCreate).not.toHaveBeenCalled()
  })

  it('refuses a link before any database access', async () => {
    await expect(
      m.createIdea({}, { ...ideaArgs, body: 'see https://evil.example' }, asUser)
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } })
    expect(ideaCount).not.toHaveBeenCalled()
    expect(ideaFindFirst).not.toHaveBeenCalled()
    expect(ideaCreate).not.toHaveBeenCalled()
  })

  it('refuses a bad category before any database access', async () => {
    await expect(m.createIdea({}, { ...ideaArgs, category: 'NOPE' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    })
    expect(ideaCount).not.toHaveBeenCalled()
  })
})

describe('createComment', () => {
  it('creates a comment owned by the caller', async () => {
    const out = await m.createComment({}, { ideaId: 'i1', body: 'nice' }, asUser)
    expect(commentCreate).toHaveBeenCalledWith({ data: { ideaId: 'i1', authorId: 'u1', body: 'nice' } })
    expect(out.id).toBe('newc')
  })

  it('refuses the 51st comment in a day and does not create it', async () => {
    commentCount.mockResolvedValue(BOARD_LIMITS.commentsPerDay)
    await expect(m.createComment({}, { ideaId: 'i1', body: 'nice' }, asUser)).rejects.toMatchObject({
      message: `You can post up to ${BOARD_LIMITS.commentsPerDay} comments a day. Try again tomorrow.`,
      extensions: { code: 'BAD_USER_INPUT' },
    })
    expect(commentCreate).not.toHaveBeenCalled()
  })

  it('refuses an identical body from the same author within a day', async () => {
    commentFindFirst.mockResolvedValue({ id: 'old' })
    await expect(m.createComment({}, { ideaId: 'i1', body: 'Nice' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    })
    const where = commentFindFirst.mock.calls[0][0].where
    expect(where.authorId).toBe('u1')
    expect(where.body).toEqual({ equals: 'Nice', mode: 'insensitive' })
    expect(commentCreate).not.toHaveBeenCalled()
  })

  it('refuses a link before any database access', async () => {
    await expect(
      m.createComment({}, { ideaId: 'i1', body: 'go to www.evil.example' }, asUser)
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } })
    expect(ideaFindUnique).not.toHaveBeenCalled()
    expect(commentCount).not.toHaveBeenCalled()
    expect(commentCreate).not.toHaveBeenCalled()
  })

  it('gives NOT_FOUND for a missing idea', async () => {
    ideaFindUnique.mockResolvedValue(null)
    await expect(m.createComment({}, { ideaId: 'nope', body: 'nice' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
    expect(commentCreate).not.toHaveBeenCalled()
  })

  it('gives NOT_FOUND for a hidden idea to an ordinary user (R3)', async () => {
    ideaFindUnique.mockResolvedValue(makeIdea({ hiddenAt: date }))
    await expect(m.createComment({}, { ideaId: 'i1', body: 'nice' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
    expect(commentCreate).not.toHaveBeenCalled()
  })

  it('gives NOT_FOUND for a hidden idea to its own author (R3)', async () => {
    ideaFindUnique.mockResolvedValue(makeIdea({ hiddenAt: date, authorId: 'u1' }))
    await expect(m.createComment({}, { ideaId: 'i1', body: 'nice' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
  })

  it('lets a moderator comment on a hidden idea', async () => {
    ideaFindUnique.mockResolvedValue(makeIdea({ hiddenAt: date }))
    await m.createComment({}, { ideaId: 'i1', body: 'note' }, asAdmin)
    expect(commentCreate).toHaveBeenCalled()
  })
})

describe('voteIdea', () => {
  it('records the vote and returns the idea', async () => {
    const out = await m.voteIdea({}, { ideaId: 'i1' }, asUser)
    expect(ideaVoteCreate).toHaveBeenCalledWith({ data: { ideaId: 'i1', userId: 'u1' } })
    expect(out.id).toBe('i1')
  })

  it('allows voting for your own idea', async () => {
    ideaFindUnique.mockResolvedValue(makeIdea({ authorId: 'u1' }))
    await expect(m.voteIdea({}, { ideaId: 'i1' }, asUser)).resolves.toMatchObject({ id: 'i1' })
    expect(ideaVoteCreate).toHaveBeenCalled()
  })

  it('gives the friendly message for an existing vote', async () => {
    ideaVoteFindUnique.mockResolvedValue({ id: 'v1' })
    await expect(m.voteIdea({}, { ideaId: 'i1' }, asUser)).rejects.toMatchObject({
      message: 'You already voted for this.',
      extensions: { code: 'BAD_USER_INPUT' },
    })
    expect(ideaVoteCreate).not.toHaveBeenCalled()
  })

  it('gives the friendly message when a race trips the unique index (P2002)', async () => {
    ideaVoteCreate.mockRejectedValue({ code: 'P2002' })
    await expect(m.voteIdea({}, { ideaId: 'i1' }, asUser)).rejects.toMatchObject({
      message: 'You already voted for this.',
      extensions: { code: 'BAD_USER_INPUT' },
    })
  })

  it('rethrows other database errors', async () => {
    const boom = new Error('db down')
    ideaVoteCreate.mockRejectedValue(boom)
    await expect(m.voteIdea({}, { ideaId: 'i1' }, asUser)).rejects.toBe(boom)
  })

  it('gives NOT_FOUND for a missing idea', async () => {
    ideaFindUnique.mockResolvedValue(null)
    await expect(m.voteIdea({}, { ideaId: 'nope' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
  })

  it('gives NOT_FOUND for a hidden idea to an ordinary user and writes nothing (R3)', async () => {
    ideaFindUnique.mockResolvedValue(makeIdea({ hiddenAt: date }))
    await expect(m.voteIdea({}, { ideaId: 'i1' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
    expect(ideaVoteFindUnique).not.toHaveBeenCalled()
    expect(ideaVoteCreate).not.toHaveBeenCalled()
  })

  it('lets a moderator vote on a hidden idea', async () => {
    ideaFindUnique.mockResolvedValue(makeIdea({ hiddenAt: date }))
    await expect(m.voteIdea({}, { ideaId: 'i1' }, asAdmin)).resolves.toMatchObject({ id: 'i1' })
    expect(ideaVoteCreate).toHaveBeenCalledWith({ data: { ideaId: 'i1', userId: 'adm' } })
  })
})

describe('unvoteIdea', () => {
  it('deletes only the caller row and returns the idea', async () => {
    const out = await m.unvoteIdea({}, { ideaId: 'i1' }, asUser)
    expect(ideaVoteDeleteMany).toHaveBeenCalledWith({ where: { ideaId: 'i1', userId: 'u1' } })
    expect(out.id).toBe('i1')
  })

  it('is not an error when there is no vote to remove', async () => {
    ideaVoteDeleteMany.mockResolvedValue({ count: 0 })
    await expect(m.unvoteIdea({}, { ideaId: 'i1' }, asUser)).resolves.toMatchObject({ id: 'i1' })
  })

  it('gives NOT_FOUND for a missing idea', async () => {
    ideaFindUnique.mockResolvedValue(null)
    await expect(m.unvoteIdea({}, { ideaId: 'nope' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
  })

  it('gives NOT_FOUND for a hidden idea to an ordinary user and touches no vote (R3)', async () => {
    ideaFindUnique.mockResolvedValue(makeIdea({ hiddenAt: date }))
    await expect(m.unvoteIdea({}, { ideaId: 'i1' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
    expect(ideaVoteDeleteMany).not.toHaveBeenCalled()
  })

  it('lets a moderator unvote a hidden idea', async () => {
    ideaFindUnique.mockResolvedValue(makeIdea({ hiddenAt: date }))
    await expect(m.unvoteIdea({}, { ideaId: 'i1' }, asAdmin)).resolves.toMatchObject({ id: 'i1' })
  })
})

describe('deleteIdea', () => {
  it('lets the author delete their idea', async () => {
    ideaFindUnique.mockResolvedValue(makeIdea({ authorId: 'u1' }))
    await expect(m.deleteIdea({}, { id: 'i1' }, asUser)).resolves.toBe(true)
    expect(ideaDelete).toHaveBeenCalledWith({ where: { id: 'i1' } })
  })

  it('gives FORBIDDEN to someone else and does not delete', async () => {
    await expect(m.deleteIdea({}, { id: 'i1' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    })
    expect(ideaDelete).not.toHaveBeenCalled()
  })

  it('does not let an admin delete another member idea through the member mutation', async () => {
    await expect(m.deleteIdea({}, { id: 'i1' }, asAdmin)).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    })
    expect(ideaDelete).not.toHaveBeenCalled()
  })

  it('gives NOT_FOUND for a missing idea', async () => {
    ideaFindUnique.mockResolvedValue(null)
    await expect(m.deleteIdea({}, { id: 'nope' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
  })

  it('gives NOT_FOUND (not FORBIDDEN) for someone else on a hidden idea (R3)', async () => {
    ideaFindUnique.mockResolvedValue(makeIdea({ hiddenAt: date }))
    await expect(m.deleteIdea({}, { id: 'i1' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
    expect(ideaDelete).not.toHaveBeenCalled()
  })

  it('gives NOT_FOUND to the author of a hidden idea, who must not learn it was hidden (R3)', async () => {
    ideaFindUnique.mockResolvedValue(makeIdea({ hiddenAt: date, authorId: 'u1' }))
    await expect(m.deleteIdea({}, { id: 'i1' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
    expect(ideaDelete).not.toHaveBeenCalled()
  })
})

describe('voteComment', () => {
  it('records the vote and returns the comment without the lookup join', async () => {
    const out = await m.voteComment({}, { commentId: 'c1' }, asUser)
    expect(commentVoteCreate).toHaveBeenCalledWith({ data: { commentId: 'c1', userId: 'u1' } })
    expect(out.id).toBe('c1')
    expect(out).not.toHaveProperty('idea')
  })

  it('allows voting for your own comment', async () => {
    commentFindUnique.mockResolvedValue(makeComment({ authorId: 'u1' }))
    await expect(m.voteComment({}, { commentId: 'c1' }, asUser)).resolves.toMatchObject({ id: 'c1' })
    expect(commentVoteCreate).toHaveBeenCalled()
  })

  it('gives the friendly message for an existing vote', async () => {
    commentVoteFindUnique.mockResolvedValue({ id: 'cv1' })
    await expect(m.voteComment({}, { commentId: 'c1' }, asUser)).rejects.toMatchObject({
      message: 'You already voted for this.',
      extensions: { code: 'BAD_USER_INPUT' },
    })
    expect(commentVoteCreate).not.toHaveBeenCalled()
  })

  it('gives the friendly message on P2002', async () => {
    commentVoteCreate.mockRejectedValue({ code: 'P2002' })
    await expect(m.voteComment({}, { commentId: 'c1' }, asUser)).rejects.toMatchObject({
      message: 'You already voted for this.',
      extensions: { code: 'BAD_USER_INPUT' },
    })
  })

  it('gives NOT_FOUND for a missing comment', async () => {
    commentFindUnique.mockResolvedValue(null)
    await expect(m.voteComment({}, { commentId: 'nope' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
  })

  it('gives NOT_FOUND for a hidden comment to an ordinary user (R3)', async () => {
    commentFindUnique.mockResolvedValue(makeComment({ hiddenAt: date }))
    await expect(m.voteComment({}, { commentId: 'c1' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
    expect(commentVoteCreate).not.toHaveBeenCalled()
  })

  it('gives NOT_FOUND for a comment under a hidden idea to an ordinary user (R3)', async () => {
    commentFindUnique.mockResolvedValue(makeComment({}, date))
    await expect(m.voteComment({}, { commentId: 'c1' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
    expect(commentVoteCreate).not.toHaveBeenCalled()
  })

  it('lets a moderator vote on a hidden comment', async () => {
    commentFindUnique.mockResolvedValue(makeComment({ hiddenAt: date }))
    await expect(m.voteComment({}, { commentId: 'c1' }, asAdmin)).resolves.toMatchObject({ id: 'c1' })
    expect(commentVoteCreate).toHaveBeenCalledWith({ data: { commentId: 'c1', userId: 'adm' } })
  })
})

describe('unvoteComment', () => {
  it('deletes only the caller row and returns the comment', async () => {
    const out = await m.unvoteComment({}, { commentId: 'c1' }, asUser)
    expect(commentVoteDeleteMany).toHaveBeenCalledWith({ where: { commentId: 'c1', userId: 'u1' } })
    expect(out.id).toBe('c1')
  })

  it('is not an error when there is no vote to remove', async () => {
    commentVoteDeleteMany.mockResolvedValue({ count: 0 })
    await expect(m.unvoteComment({}, { commentId: 'c1' }, asUser)).resolves.toMatchObject({ id: 'c1' })
  })

  it('gives NOT_FOUND for a hidden comment to an ordinary user (R3)', async () => {
    commentFindUnique.mockResolvedValue(makeComment({ hiddenAt: date }))
    await expect(m.unvoteComment({}, { commentId: 'c1' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
    expect(commentVoteDeleteMany).not.toHaveBeenCalled()
  })

  it('gives NOT_FOUND for a comment under a hidden idea to an ordinary user (R3)', async () => {
    commentFindUnique.mockResolvedValue(makeComment({}, date))
    await expect(m.unvoteComment({}, { commentId: 'c1' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
  })

  it('lets a moderator unvote a hidden comment', async () => {
    commentFindUnique.mockResolvedValue(makeComment({ hiddenAt: date }))
    await expect(m.unvoteComment({}, { commentId: 'c1' }, asAdmin)).resolves.toMatchObject({ id: 'c1' })
  })
})

describe('deleteComment', () => {
  it('lets the author delete their comment', async () => {
    commentFindUnique.mockResolvedValue(makeComment({ authorId: 'u1' }))
    await expect(m.deleteComment({}, { id: 'c1' }, asUser)).resolves.toBe(true)
    expect(commentDelete).toHaveBeenCalledWith({ where: { id: 'c1' } })
  })

  it('gives FORBIDDEN to a USER deleting someone else comment and does not delete', async () => {
    await expect(m.deleteComment({}, { id: 'c1' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    })
    expect(commentDelete).not.toHaveBeenCalled()
  })

  it('gives NOT_FOUND for a missing comment', async () => {
    commentFindUnique.mockResolvedValue(null)
    await expect(m.deleteComment({}, { id: 'nope' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
  })

  it('gives NOT_FOUND for a hidden comment, even to its author (R3)', async () => {
    commentFindUnique.mockResolvedValue(makeComment({ hiddenAt: date, authorId: 'u1' }))
    await expect(m.deleteComment({}, { id: 'c1' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
    expect(commentDelete).not.toHaveBeenCalled()
  })

  it('gives NOT_FOUND (not FORBIDDEN) for someone else on a hidden comment (R3)', async () => {
    commentFindUnique.mockResolvedValue(makeComment({ hiddenAt: date }))
    await expect(m.deleteComment({}, { id: 'c1' }, asUser)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    })
  })
})

describe('battle votes', () => {
  it('are never read or written by any board mutation', async () => {
    for (const [name, args] of calls) {
      ideaFindUnique.mockResolvedValue(makeIdea({ authorId: 'u1' }))
      commentFindUnique.mockResolvedValue(makeComment({ authorId: 'u1' }))
      await m[name]({}, args, asUser).catch(() => undefined)
    }
    for (const f of Object.values(battleVote)) expect(f).not.toHaveBeenCalled()
  })
})
