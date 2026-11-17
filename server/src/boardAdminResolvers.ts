import { GraphQLError } from 'graphql'
import type { IdeaStatus, Prisma } from '@prisma/client'
import { db } from './db'
import { requireAdmin, type Context } from './context'
import { auditData, type AuditAction } from './audit'
import { actorParty, partyOf } from './adminResolvers'
import { excerpt } from './boardRules'

/** The author columns the audit entry snapshots. */
const authorSelect = { select: { id: true, username: true, email: true } } as const

/** What one moderation does to a loaded item: its audit action, extra audit details and the write itself. */
interface Change {
  action: AuditAction
  details?: Record<string, unknown>
  write: Prisma.PrismaPromise<unknown>
}

interface Moderated {
  id: string
  author: { id: string; username: string | null; email: string }
}

/**
 * The one load -> audit -> transact sequence behind every moderation mutation. `plan` returns the
 * change for the loaded item, or null when there is nothing to do (a no-op writes no audit row).
 * The audit row is built before the write is queued: it throws when the actor's email is missing,
 * so nothing is written. Returns the updated row, or the loaded one for a no-op.
 */
async function moderate<Row extends Moderated>(
  actor: { id: string },
  ctx: Context,
  input: {
    row: Row | null
    notFound: string
    targetType: 'IDEA' | 'COMMENT'
    baseDetails: (row: Row) => Record<string, unknown>
    plan: (row: Row) => Change | null
  },
) {
  const { row } = input
  if (!row) throw new GraphQLError(input.notFound, { extensions: { code: 'NOT_FOUND' } })

  const change = input.plan(row)
  if (!change) return row

  const audit = auditData({
    actor: actorParty(ctx, actor),
    action: change.action,
    target: partyOf(row.author),
    targetType: input.targetType,
    targetId: row.id,
    details: { ...input.baseDetails(row), ...change.details },
  })
  // One transaction: the moderation and its audit entry both happen or neither does.
  const [result] = await db.$transaction([change.write, db.adminAuditLog.create({ data: audit })])
  return result
}

const ideaBase = (idea: { title: string }) => ({ excerpt: excerpt(idea.title) })
const commentBase = (comment: { body: string; ideaId: string }) => ({
  excerpt: excerpt(comment.body),
  ideaId: comment.ideaId,
})

const loadIdea = (id: string) => db.idea.findUnique({ where: { id }, include: { author: authorSelect } })
const loadComment = (id: string) => db.ideaComment.findUnique({ where: { id }, include: { author: authorSelect } })

/** Moderates an idea. The caller has already passed `requireAdmin`, before any database read. */
async function moderateIdea(
  ctx: Context,
  actor: { id: string },
  id: string,
  plan: (idea: NonNullable<Awaited<ReturnType<typeof loadIdea>>>) => Change | null,
) {
  return moderate(actor, ctx, {
    row: await loadIdea(id),
    notFound: 'Idea not found',
    targetType: 'IDEA',
    baseDetails: ideaBase,
    plan,
  })
}

/** Moderates a comment. The caller has already passed `requireAdmin`, before any database read. */
async function moderateComment(
  ctx: Context,
  actor: { id: string },
  id: string,
  plan: (comment: NonNullable<Awaited<ReturnType<typeof loadComment>>>) => Change | null,
) {
  return moderate(actor, ctx, {
    row: await loadComment(id),
    notFound: 'Comment not found',
    targetType: 'COMMENT',
    baseDetails: commentBase,
    plan,
  })
}

/** Board moderation (ADMIN and OWNER). Each mutation checks permission first, before any read. */
export const boardAdminMutation = {
  adminSetIdeaStatus: async (_: unknown, args: { id: string; status: IdeaStatus }, ctx: Context) => {
    const actor = requireAdmin(ctx, 'moderateBoard')
    return moderateIdea(ctx, actor, args.id, (idea) =>
      idea.status === args.status
        ? null
        : {
            action: 'IDEA_STATUS',
            details: { from: idea.status, to: args.status },
            write: db.idea.update({ where: { id: idea.id }, data: { status: args.status } }),
          },
    )
  },

  adminHideIdea: async (_: unknown, args: { id: string }, ctx: Context) => {
    const actor = requireAdmin(ctx, 'moderateBoard')
    return moderateIdea(ctx, actor, args.id, (idea) =>
      idea.hiddenAt
        ? null
        : {
            action: 'IDEA_HIDE',
            write: db.idea.update({ where: { id: idea.id }, data: { hiddenAt: new Date() } }),
          },
    )
  },

  adminUnhideIdea: async (_: unknown, args: { id: string }, ctx: Context) => {
    const actor = requireAdmin(ctx, 'moderateBoard')
    return moderateIdea(ctx, actor, args.id, (idea) =>
      idea.hiddenAt
        ? { action: 'IDEA_UNHIDE', write: db.idea.update({ where: { id: idea.id }, data: { hiddenAt: null } }) }
        : null,
    )
  },

  adminDeleteIdea: async (_: unknown, args: { id: string }, ctx: Context) => {
    const actor = requireAdmin(ctx, 'moderateBoard')
    // The database cascades the idea's votes and comments.
    await moderateIdea(ctx, actor, args.id, (idea) => ({
      action: 'IDEA_DELETE',
      write: db.idea.delete({ where: { id: idea.id } }),
    }))
    return true
  },

  adminHideComment: async (_: unknown, args: { id: string }, ctx: Context) => {
    const actor = requireAdmin(ctx, 'moderateBoard')
    return moderateComment(ctx, actor, args.id, (comment) =>
      comment.hiddenAt
        ? null
        : {
            action: 'COMMENT_HIDE',
            write: db.ideaComment.update({ where: { id: comment.id }, data: { hiddenAt: new Date() } }),
          },
    )
  },

  adminUnhideComment: async (_: unknown, args: { id: string }, ctx: Context) => {
    const actor = requireAdmin(ctx, 'moderateBoard')
    return moderateComment(ctx, actor, args.id, (comment) =>
      comment.hiddenAt
        ? {
            action: 'COMMENT_UNHIDE',
            write: db.ideaComment.update({ where: { id: comment.id }, data: { hiddenAt: null } }),
          }
        : null,
    )
  },

  adminDeleteComment: async (_: unknown, args: { id: string }, ctx: Context) => {
    const actor = requireAdmin(ctx, 'moderateBoard')
    // The database cascades the comment's votes.
    await moderateComment(ctx, actor, args.id, (comment) => ({
      action: 'COMMENT_DELETE',
      write: db.ideaComment.delete({ where: { id: comment.id } }),
    }))
    return true
  },
}
