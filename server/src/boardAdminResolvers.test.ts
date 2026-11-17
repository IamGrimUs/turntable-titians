import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    idea: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    ideaComment: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    adminAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    vote: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), delete: vi.fn() },
  },
}))

import { db } from './db'
import { boardAdminMutation } from './boardAdminResolvers'

const ideaFindUnique = db.idea.findUnique as unknown as ReturnType<typeof vi.fn>
const ideaUpdate = db.idea.update as unknown as ReturnType<typeof vi.fn>
const ideaDelete = db.idea.delete as unknown as ReturnType<typeof vi.fn>
const commentFindUnique = db.ideaComment.findUnique as unknown as ReturnType<typeof vi.fn>
const commentUpdate = db.ideaComment.update as unknown as ReturnType<typeof vi.fn>
const commentDelete = db.ideaComment.delete as unknown as ReturnType<typeof vi.fn>
const auditCreate = db.adminAuditLog.create as unknown as ReturnType<typeof vi.fn>
const transaction = db.$transaction as unknown as ReturnType<typeof vi.fn>
const battleVote = db.vote as unknown as Record<string, ReturnType<typeof vi.fn>>

type Resolver = (...args: any[]) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any
const setStatus = boardAdminMutation.adminSetIdeaStatus as Resolver
const hideIdea = boardAdminMutation.adminHideIdea as Resolver
const unhideIdea = boardAdminMutation.adminUnhideIdea as Resolver
const deleteIdea = boardAdminMutation.adminDeleteIdea as Resolver
const hideComment = boardAdminMutation.adminHideComment as Resolver
const unhideComment = boardAdminMutation.adminUnhideComment as Resolver
const deleteComment = boardAdminMutation.adminDeleteComment as Resolver

const anonymous = { userId: null }
const asUser = { userId: 'u1', role: 'USER' as const }
const boss = { userId: 'adm', role: 'ADMIN' as const, username: 'boss', email: 'boss@example.com' }

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (e) {
    return e as { message: string; extensions: { code: string } }
  }
  throw new Error('expected the resolver to throw')
}

const author = { id: 'a1', username: 'writer', email: 'writer@example.com' }
const HIDDEN_AT = new Date('2026-11-01T00:00:00.000Z')

const idea = (extra: Record<string, unknown> = {}) => ({
  id: 'i1',
  title: 'More   scratch\nbattles',
  status: 'OPEN',
  hiddenAt: null,
  author,
  ...extra,
})
const comment = (extra: Record<string, unknown> = {}) => ({
  id: 'c1',
  ideaId: 'i1',
  body: 'Great idea',
  hiddenAt: null,
  author,
  ...extra,
})

const authorSnapshot = { targetUsername: 'writer', targetEmail: 'writer@example.com' }

beforeEach(() => {
  ideaFindUnique.mockReset().mockResolvedValue(idea())
  commentFindUnique.mockReset().mockResolvedValue(comment())
  ideaUpdate.mockReset().mockImplementation((args: unknown) => ({ op: 'idea.update', args }))
  ideaDelete.mockReset().mockImplementation((args: unknown) => ({ op: 'idea.delete', args }))
  commentUpdate.mockReset().mockImplementation((args: unknown) => ({ op: 'ideaComment.update', args }))
  commentDelete.mockReset().mockImplementation((args: unknown) => ({ op: 'ideaComment.delete', args }))
  auditCreate.mockReset().mockImplementation((args: unknown) => ({ op: 'adminAuditLog.create', args }))
  transaction.mockReset().mockImplementation((ops: unknown[]) => Promise.all(ops))
  Object.values(battleVote).forEach((fn) => fn.mockReset())
})

const cases: [string, Resolver, Record<string, unknown>][] = [
  ['adminSetIdeaStatus', setStatus, { id: 'i1', status: 'PLANNED' }],
  ['adminHideIdea', hideIdea, { id: 'i1' }],
  ['adminUnhideIdea', unhideIdea, { id: 'i1' }],
  ['adminDeleteIdea', deleteIdea, { id: 'i1' }],
  ['adminHideComment', hideComment, { id: 'c1' }],
  ['adminUnhideComment', unhideComment, { id: 'c1' }],
  ['adminDeleteComment', deleteComment, { id: 'c1' }],
]

describe.each(cases)('%s access', (_name, resolver, args) => {
  it('refuses an anonymous caller before any database read', async () => {
    const err = await rejection(resolver({}, args, anonymous))
    expect(err.extensions.code).toBe('UNAUTHENTICATED')
    expect(ideaFindUnique).not.toHaveBeenCalled()
    expect(commentFindUnique).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('refuses a USER before any database read', async () => {
    const err = await rejection(resolver({}, args, asUser))
    expect(err.extensions.code).toBe('FORBIDDEN')
    expect(ideaFindUnique).not.toHaveBeenCalled()
    expect(commentFindUnique).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('refuses a suspended ADMIN before any database read', async () => {
    const suspended = { ...boss, suspension: { reason: 'spam', until: null } }
    const err = await rejection(resolver({}, args, suspended))
    expect(err.extensions.code).toBe('FORBIDDEN')
    expect(ideaFindUnique).not.toHaveBeenCalled()
    expect(commentFindUnique).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })
})

describe('board moderation writes', () => {
  it('adminSetIdeaStatus updates the status and records from and to', async () => {
    await setStatus({}, { id: 'i1', status: 'PLANNED' }, boss)
    expect(ideaFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'i1' } }),
    )
    expect(ideaUpdate).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { status: 'PLANNED' } })
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(transaction.mock.calls[0][0]).toHaveLength(2)
    expect(auditCreate).toHaveBeenCalledTimes(1)
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      actorId: 'adm',
      actorUsername: 'boss',
      actorEmail: 'boss@example.com',
      action: 'IDEA_STATUS',
      targetType: 'IDEA',
      targetId: 'i1',
      targetUsername: 'writer',
      targetEmail: 'writer@example.com',
      details: { excerpt: 'More scratch battles', from: 'OPEN', to: 'PLANNED' },
    })
  })

  it('adminSetIdeaStatus to the same status is a no-op: no audit row, no transaction', async () => {
    const result = await setStatus({}, { id: 'i1', status: 'OPEN' }, boss)
    expect(result).toMatchObject({ id: 'i1', status: 'OPEN' })
    expect(transaction).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
    expect(ideaUpdate).not.toHaveBeenCalled()
  })

  it('adminHideIdea sets hiddenAt and writes one IDEA_HIDE row', async () => {
    await hideIdea({}, { id: 'i1' }, boss)
    expect(ideaUpdate).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { hiddenAt: expect.any(Date) } })
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(auditCreate).toHaveBeenCalledTimes(1)
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      action: 'IDEA_HIDE',
      targetType: 'IDEA',
      targetId: 'i1',
      ...authorSnapshot,
      details: { excerpt: 'More scratch battles' },
    })
  })

  it('adminHideIdea on an already hidden idea writes nothing and returns it', async () => {
    ideaFindUnique.mockResolvedValue(idea({ hiddenAt: HIDDEN_AT }))
    const result = await hideIdea({}, { id: 'i1' }, boss)
    expect(result).toMatchObject({ id: 'i1', hiddenAt: HIDDEN_AT })
    expect(transaction).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('adminUnhideIdea clears hiddenAt and writes one IDEA_UNHIDE row', async () => {
    ideaFindUnique.mockResolvedValue(idea({ hiddenAt: HIDDEN_AT }))
    await unhideIdea({}, { id: 'i1' }, boss)
    expect(ideaUpdate).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { hiddenAt: null } })
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(auditCreate).toHaveBeenCalledTimes(1)
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      action: 'IDEA_UNHIDE',
      targetType: 'IDEA',
      targetId: 'i1',
      ...authorSnapshot,
    })
  })

  it('adminUnhideIdea on an idea that is not hidden writes nothing', async () => {
    await unhideIdea({}, { id: 'i1' }, boss)
    expect(transaction).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('adminDeleteIdea deletes the idea, writes one IDEA_DELETE row and returns true', async () => {
    const result = await deleteIdea({}, { id: 'i1' }, boss)
    expect(result).toBe(true)
    expect(ideaDelete).toHaveBeenCalledWith({ where: { id: 'i1' } })
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(transaction.mock.calls[0][0]).toHaveLength(2)
    expect(auditCreate).toHaveBeenCalledTimes(1)
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      action: 'IDEA_DELETE',
      targetType: 'IDEA',
      targetId: 'i1',
      ...authorSnapshot,
      details: { excerpt: 'More scratch battles' },
    })
  })

  it('adminHideComment sets hiddenAt and writes one COMMENT_HIDE row with the idea id', async () => {
    await hideComment({}, { id: 'c1' }, boss)
    expect(commentFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1' } }))
    expect(commentUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { hiddenAt: expect.any(Date) } })
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(transaction.mock.calls[0][0]).toEqual([
      { op: 'ideaComment.update', args: { where: { id: 'c1' }, data: { hiddenAt: expect.any(Date) } } },
      { op: 'adminAuditLog.create', args: expect.objectContaining({ data: expect.objectContaining({ action: 'COMMENT_HIDE' }) }) },
    ])
    expect(auditCreate).toHaveBeenCalledTimes(1)
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      action: 'COMMENT_HIDE',
      targetType: 'COMMENT',
      targetId: 'c1',
      ...authorSnapshot,
      details: { excerpt: 'Great idea', ideaId: 'i1' },
    })
  })

  it('adminHideComment on an already hidden comment writes nothing', async () => {
    commentFindUnique.mockResolvedValue(comment({ hiddenAt: HIDDEN_AT }))
    const result = await hideComment({}, { id: 'c1' }, boss)
    expect(result).toMatchObject({ id: 'c1' })
    expect(transaction).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('adminUnhideComment clears hiddenAt and writes one COMMENT_UNHIDE row', async () => {
    commentFindUnique.mockResolvedValue(comment({ hiddenAt: HIDDEN_AT }))
    await unhideComment({}, { id: 'c1' }, boss)
    expect(commentUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { hiddenAt: null } })
    expect(auditCreate).toHaveBeenCalledTimes(1)
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      action: 'COMMENT_UNHIDE',
      targetType: 'COMMENT',
      targetId: 'c1',
      details: { excerpt: 'Great idea', ideaId: 'i1' },
    })
  })

  it('adminUnhideComment on a comment that is not hidden writes nothing', async () => {
    await unhideComment({}, { id: 'c1' }, boss)
    expect(transaction).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('adminDeleteComment goes through db.ideaComment.delete and writes one COMMENT_DELETE row', async () => {
    const result = await deleteComment({}, { id: 'c1' }, boss)
    expect(result).toBe(true)
    expect(commentDelete).toHaveBeenCalledWith({ where: { id: 'c1' } })
    expect(ideaDelete).not.toHaveBeenCalled()
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(transaction.mock.calls[0][0]).toEqual([
      { op: 'ideaComment.delete', args: { where: { id: 'c1' } } },
      { op: 'adminAuditLog.create', args: expect.objectContaining({ data: expect.objectContaining({ action: 'COMMENT_DELETE' }) }) },
    ])
    expect(auditCreate).toHaveBeenCalledTimes(1)
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      action: 'COMMENT_DELETE',
      targetType: 'COMMENT',
      targetId: 'c1',
      ...authorSnapshot,
      details: { excerpt: 'Great idea', ideaId: 'i1' },
    })
  })

  it('returns the updated row from the transaction', async () => {
    const result = await hideIdea({}, { id: 'i1' }, boss)
    expect(result).toMatchObject({ op: 'idea.update' })
  })

  it('never touches the battle vote model', async () => {
    await hideIdea({}, { id: 'i1' }, boss)
    await deleteComment({}, { id: 'c1' }, boss)
    Object.values(battleVote).forEach((fn) => expect(fn).not.toHaveBeenCalled())
  })
})

describe('board moderation failures', () => {
  it.each([
    ['adminSetIdeaStatus', setStatus, { id: 'nope', status: 'DONE' }, 'Idea not found'],
    ['adminHideIdea', hideIdea, { id: 'nope' }, 'Idea not found'],
    ['adminUnhideIdea', unhideIdea, { id: 'nope' }, 'Idea not found'],
    ['adminDeleteIdea', deleteIdea, { id: 'nope' }, 'Idea not found'],
    ['adminHideComment', hideComment, { id: 'nope' }, 'Comment not found'],
    ['adminUnhideComment', unhideComment, { id: 'nope' }, 'Comment not found'],
    ['adminDeleteComment', deleteComment, { id: 'nope' }, 'Comment not found'],
  ])('%s: an unknown id is NOT_FOUND with no transaction', async (_name, resolver, args, message) => {
    ideaFindUnique.mockResolvedValue(null)
    commentFindUnique.mockResolvedValue(null)
    const err = await rejection(resolver({}, args, boss))
    expect(err.extensions.code).toBe('NOT_FOUND')
    expect(err.message).toBe(message)
    expect(transaction).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it.each([
    ['adminHideIdea', hideIdea, { id: 'i1' }],
    ['adminDeleteIdea', deleteIdea, { id: 'i1' }],
    ['adminHideComment', hideComment, { id: 'c1' }],
    ['adminDeleteComment', deleteComment, { id: 'c1' }],
  ])('%s: a missing actor email throws and nothing is written', async (_name, resolver, args) => {
    await expect(resolver({}, args, { ...boss, email: undefined })).rejects.toThrow('audit: actor email missing')
    expect(transaction).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })
})
