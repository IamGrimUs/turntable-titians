import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    idea: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    ideaVote: { count: vi.fn(), findFirst: vi.fn() },
    ideaComment: { findMany: vi.fn(), count: vi.fn() },
    ideaCommentVote: { count: vi.fn(), findFirst: vi.fn() },
    // The battle vote model: the board must never touch it.
    vote: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  },
}))

import { db } from './db'
import { boardQuery, boardIdea, boardComment, canSeeHidden } from './boardResolvers'

const fn = (f: unknown) => f as ReturnType<typeof vi.fn>
const ideaFindMany = fn(db.idea.findMany)
const ideaFindUnique = fn(db.idea.findUnique)
const ideaCount = fn(db.idea.count)
const ideaVoteCount = fn(db.ideaVote.count)
const ideaVoteFindFirst = fn(db.ideaVote.findFirst)
const commentFindMany = fn(db.ideaComment.findMany)
const commentCount = fn(db.ideaComment.count)
const commentVoteCount = fn(db.ideaCommentVote.count)
const commentVoteFindFirst = fn(db.ideaCommentVote.findFirst)
const userFindUnique = fn(db.user.findUnique)

/* eslint-disable @typescript-eslint/no-explicit-any */
const ideas = boardQuery.ideas as (...args: any[]) => Promise<any>
const idea = boardQuery.idea as (...args: any[]) => Promise<any>
const ideaFields = boardIdea as Record<string, (...args: any[]) => any>
const commentFields = boardComment as Record<string, (...args: any[]) => any>
/* eslint-enable @typescript-eslint/no-explicit-any */

const anonymous = { userId: null }
const asUser = { userId: 'u1', role: 'USER' as const }
const asAdmin = { userId: 'adm', role: 'ADMIN' as const }
const asOwner = { userId: 'own', role: 'OWNER' as const }
const suspendedAdmin = {
  userId: 'adm',
  role: 'ADMIN' as const,
  suspension: { reason: 'x', until: null },
}

const defaults = { sort: 'VOTES', includeHidden: false, page: 1, pageSize: 20 }
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

function makeComment(over: Record<string, unknown> = {}) {
  return { id: 'c1', ideaId: 'i1', authorId: 'u9', body: 'hi', hiddenAt: null, createdAt: date, ...over }
}

beforeEach(() => {
  vi.clearAllMocks()
  ideaCount.mockResolvedValue(0)
  ideaFindMany.mockResolvedValue([])
})

describe('canSeeHidden', () => {
  it('is true for ADMIN and OWNER', () => {
    expect(canSeeHidden(asAdmin)).toBe(true)
    expect(canSeeHidden(asOwner)).toBe(true)
  })

  it('is false for anonymous, USER, a missing role, and a suspended admin', () => {
    expect(canSeeHidden(anonymous)).toBe(false)
    expect(canSeeHidden(asUser)).toBe(false)
    expect(canSeeHidden({ userId: 'u1' })).toBe(false)
    expect(canSeeHidden(suspendedAdmin)).toBe(false)
  })
})

describe('ideas', () => {
  it('works for an anonymous caller and always filters hidden ideas out', async () => {
    const result = await ideas({}, defaults, anonymous)
    expect(result).toEqual({ rows: [], total: 0, page: 1, pageCount: 1 })
    expect(ideaCount.mock.calls[0][0].where).toMatchObject({ hiddenAt: null })
    expect(ideaFindMany.mock.calls[0][0].where).toMatchObject({ hiddenAt: null })
  })

  it('ignores includeHidden: true from a USER, silently', async () => {
    await ideas({}, { ...defaults, includeHidden: true }, asUser)
    expect(ideaCount.mock.calls[0][0].where).toMatchObject({ hiddenAt: null })
    expect(ideaFindMany.mock.calls[0][0].where).toMatchObject({ hiddenAt: null })
  })

  it('ignores includeHidden: true from an anonymous caller', async () => {
    await ideas({}, { ...defaults, includeHidden: true }, anonymous)
    expect(ideaFindMany.mock.calls[0][0].where).toMatchObject({ hiddenAt: null })
  })

  it('ignores includeHidden: true from a suspended admin', async () => {
    await ideas({}, { ...defaults, includeHidden: true }, suspendedAdmin)
    expect(ideaFindMany.mock.calls[0][0].where).toMatchObject({ hiddenAt: null })
  })

  it('has no hiddenAt filter for an ADMIN with includeHidden: true', async () => {
    await ideas({}, { ...defaults, includeHidden: true }, asAdmin)
    expect(ideaCount.mock.calls[0][0].where).not.toHaveProperty('hiddenAt')
    expect(ideaFindMany.mock.calls[0][0].where).not.toHaveProperty('hiddenAt')
  })

  it('still hides hidden ideas from an ADMIN who does not ask for them', async () => {
    await ideas({}, defaults, asAdmin)
    expect(ideaFindMany.mock.calls[0][0].where).toMatchObject({ hiddenAt: null })
  })

  it('applies the category, topic and status filters', async () => {
    await ideas({}, { ...defaults, category: 'BUG', topic: 'BATTLES', status: 'PLANNED' }, anonymous)
    expect(ideaFindMany.mock.calls[0][0].where).toEqual({
      hiddenAt: null,
      category: 'BUG',
      topic: 'BATTLES',
      status: 'PLANNED',
    })
  })

  it('leaves filters out when they are not given', async () => {
    await ideas({}, { ...defaults, category: null, topic: null, status: null }, anonymous)
    expect(ideaFindMany.mock.calls[0][0].where).toEqual({ hiddenAt: null })
  })

  it('sorts VOTES by vote count then newest', async () => {
    await ideas({}, { ...defaults, sort: 'VOTES' }, anonymous)
    expect(ideaFindMany.mock.calls[0][0].orderBy).toEqual([
      { votes: { _count: 'desc' } },
      { createdAt: 'desc' },
    ])
  })

  it('sorts NEWEST by createdAt', async () => {
    await ideas({}, { ...defaults, sort: 'NEWEST' }, anonymous)
    expect(ideaFindMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'desc' }])
  })

  it('defaults to a page size of 20 and clamps it to 1..50', async () => {
    await ideas({}, { ...defaults, pageSize: undefined }, anonymous)
    expect(ideaFindMany.mock.calls[0][0].take).toBe(20)
    await ideas({}, { ...defaults, pageSize: 500 }, anonymous)
    expect(ideaFindMany.mock.calls[1][0].take).toBe(50)
    await ideas({}, { ...defaults, pageSize: 0 }, anonymous)
    expect(ideaFindMany.mock.calls[2][0].take).toBe(1)
  })

  it('clamps the page to the available pages and returns the paging numbers', async () => {
    ideaCount.mockResolvedValue(45)
    ideaFindMany.mockResolvedValue([makeIdea()])
    const result = await ideas({}, { ...defaults, page: 99 }, anonymous)
    expect(result.total).toBe(45)
    expect(result.pageCount).toBe(3)
    expect(result.page).toBe(3)
    expect(ideaFindMany.mock.calls[0][0].skip).toBe(40)
    expect(result.rows).toHaveLength(1)
  })

  it('never reads the battle vote model', async () => {
    await ideas({}, defaults, anonymous)
    expect(fn(db.vote.count)).not.toHaveBeenCalled()
    expect(fn(db.vote.findMany)).not.toHaveBeenCalled()
    expect(fn(db.vote.groupBy)).not.toHaveBeenCalled()
  })
})

describe('idea', () => {
  it('returns a visible idea to anyone', async () => {
    const row = makeIdea()
    ideaFindUnique.mockResolvedValue(row)
    expect(await idea({}, { id: 'i1' }, anonymous)).toBe(row)
    expect(await idea({}, { id: 'i1' }, asUser)).toBe(row)
  })

  it('returns null when the idea does not exist', async () => {
    ideaFindUnique.mockResolvedValue(null)
    expect(await idea({}, { id: 'nope' }, asAdmin)).toBeNull()
  })

  it('returns null for a hidden idea to an anonymous caller', async () => {
    ideaFindUnique.mockResolvedValue(makeIdea({ id: 'x', hiddenAt: date }))
    expect(await idea({}, { id: 'x' }, anonymous)).toBeNull()
  })

  it('returns null for a hidden idea to an ordinary user, even its author', async () => {
    ideaFindUnique.mockResolvedValue(makeIdea({ id: 'x', authorId: 'u1', hiddenAt: date }))
    expect(await idea({}, { id: 'x' }, asUser)).toBeNull()
  })

  it('returns null for a hidden idea to a suspended admin', async () => {
    ideaFindUnique.mockResolvedValue(makeIdea({ id: 'x', hiddenAt: date }))
    expect(await idea({}, { id: 'x' }, suspendedAdmin)).toBeNull()
  })

  it('returns a hidden idea to an ADMIN', async () => {
    const row = makeIdea({ id: 'x', hiddenAt: date })
    ideaFindUnique.mockResolvedValue(row)
    expect(await idea({}, { id: 'x' }, asAdmin)).toBe(row)
  })
})

describe('Idea fields', () => {
  it('derives hidden from hiddenAt', () => {
    expect(ideaFields.hidden(makeIdea())).toBe(false)
    expect(ideaFields.hidden(makeIdea({ hiddenAt: date }))).toBe(true)
  })

  it('returns dates as ISO strings', () => {
    expect(ideaFields.createdAt(makeIdea())).toBe('2026-01-02T03:04:05.000Z')
  })

  it('loads the author', async () => {
    userFindUnique.mockResolvedValue({ id: 'u9' })
    expect(await ideaFields.author(makeIdea())).toEqual({ id: 'u9' })
    expect(userFindUnique).toHaveBeenCalledWith({ where: { id: 'u9' } })
  })

  it('counts votes from the idea vote table only', async () => {
    ideaVoteCount.mockResolvedValue(7)
    expect(await ideaFields.voteCount(makeIdea())).toBe(7)
    expect(ideaVoteCount).toHaveBeenCalledWith({ where: { ideaId: 'i1' } })
    expect(fn(db.vote.count)).not.toHaveBeenCalled()
    expect(fn(db.vote.findFirst)).not.toHaveBeenCalled()
  })

  it('viewerHasVoted is false for anonymous without touching the database', async () => {
    expect(await ideaFields.viewerHasVoted(makeIdea(), {}, anonymous)).toBe(false)
    expect(ideaVoteFindFirst).not.toHaveBeenCalled()
    expect(fn(db.vote.findFirst)).not.toHaveBeenCalled()
  })

  it('viewerHasVoted checks only the caller own row', async () => {
    ideaVoteFindFirst.mockResolvedValue({ id: 'v' })
    expect(await ideaFields.viewerHasVoted(makeIdea(), {}, asUser)).toBe(true)
    expect(ideaVoteFindFirst.mock.calls[0][0].where).toEqual({ ideaId: 'i1', userId: 'u1' })
    ideaVoteFindFirst.mockResolvedValue(null)
    expect(await ideaFields.viewerHasVoted(makeIdea(), {}, asUser)).toBe(false)
    expect(fn(db.vote.findFirst)).not.toHaveBeenCalled()
  })

  it('comments for a USER filter out hidden comments, oldest first', async () => {
    commentFindMany.mockResolvedValue([makeComment()])
    const rows = await ideaFields.comments(makeIdea(), {}, asUser)
    expect(rows).toHaveLength(1)
    expect(commentFindMany).toHaveBeenCalledWith({
      where: { ideaId: 'i1', hiddenAt: null },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('comments for anonymous, and for a suspended admin, filter out hidden comments', async () => {
    commentFindMany.mockResolvedValue([])
    await ideaFields.comments(makeIdea(), {}, anonymous)
    await ideaFields.comments(makeIdea(), {}, suspendedAdmin)
    expect(commentFindMany.mock.calls[0][0].where).toEqual({ ideaId: 'i1', hiddenAt: null })
    expect(commentFindMany.mock.calls[1][0].where).toEqual({ ideaId: 'i1', hiddenAt: null })
  })

  it('comments for an ADMIN include hidden comments', async () => {
    commentFindMany.mockResolvedValue([])
    await ideaFields.comments(makeIdea(), {}, asAdmin)
    expect(commentFindMany.mock.calls[0][0].where).toEqual({ ideaId: 'i1' })
  })

  it('commentCount excludes hidden comments unless the caller can see them', async () => {
    commentCount.mockResolvedValue(3)
    expect(await ideaFields.commentCount(makeIdea(), {}, asUser)).toBe(3)
    expect(commentCount.mock.calls[0][0].where).toEqual({ ideaId: 'i1', hiddenAt: null })
    await ideaFields.commentCount(makeIdea(), {}, anonymous)
    expect(commentCount.mock.calls[1][0].where).toEqual({ ideaId: 'i1', hiddenAt: null })
    await ideaFields.commentCount(makeIdea(), {}, asAdmin)
    expect(commentCount.mock.calls[2][0].where).toEqual({ ideaId: 'i1' })
  })
})

describe('IdeaComment fields', () => {
  it('derives hidden from hiddenAt', () => {
    expect(commentFields.hidden(makeComment())).toBe(false)
    expect(commentFields.hidden(makeComment({ hiddenAt: date }))).toBe(true)
  })

  it('returns createdAt as an ISO string', () => {
    expect(commentFields.createdAt(makeComment())).toBe('2026-01-02T03:04:05.000Z')
  })

  it('loads the author', async () => {
    userFindUnique.mockResolvedValue({ id: 'u9' })
    expect(await commentFields.author(makeComment())).toEqual({ id: 'u9' })
    expect(userFindUnique).toHaveBeenCalledWith({ where: { id: 'u9' } })
  })

  it('counts votes from the comment vote table only', async () => {
    commentVoteCount.mockResolvedValue(4)
    expect(await commentFields.voteCount(makeComment())).toBe(4)
    expect(commentVoteCount).toHaveBeenCalledWith({ where: { commentId: 'c1' } })
    expect(fn(db.vote.count)).not.toHaveBeenCalled()
    expect(ideaVoteCount).not.toHaveBeenCalled()
  })

  it('viewerHasVoted is false for anonymous without touching the database', async () => {
    expect(await commentFields.viewerHasVoted(makeComment(), {}, anonymous)).toBe(false)
    expect(commentVoteFindFirst).not.toHaveBeenCalled()
  })

  it('viewerHasVoted checks only the caller own row', async () => {
    commentVoteFindFirst.mockResolvedValue({ id: 'v' })
    expect(await commentFields.viewerHasVoted(makeComment(), {}, asUser)).toBe(true)
    expect(commentVoteFindFirst.mock.calls[0][0].where).toEqual({ commentId: 'c1', userId: 'u1' })
    expect(fn(db.vote.findFirst)).not.toHaveBeenCalled()
  })
})
