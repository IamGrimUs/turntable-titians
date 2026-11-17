import type { Idea, IdeaCategory, IdeaComment, IdeaStatus, IdeaTopic, Prisma } from '@prisma/client'
import { db } from './db'
import type { Context } from './context'
import { can } from './permissions'
import { clampPage, clampPageSize } from './adminUserQuery'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

/**
 * Whether the caller may see hidden ideas and comments: signed in, not suspended, and allowed
 * to moderate the board. Everyone else (anonymous callers, ordinary users, the author of the
 * hidden item itself) never gets a hidden row from any read path.
 */
export function canSeeHidden(ctx: Context): boolean {
  if (!ctx.userId || ctx.suspension) return false
  return can({ id: ctx.userId, role: ctx.role ?? 'USER' }, 'moderateBoard')
}

export interface IdeasArgs {
  category?: IdeaCategory | null
  topic?: IdeaTopic | null
  status?: IdeaStatus | null
  sort?: 'VOTES' | 'NEWEST' | null
  includeHidden?: boolean | null
  page?: number | null
  pageSize?: number | null
}

export const boardQuery = {
  ideas: async (_: unknown, args: IdeasArgs, ctx: Context) => {
    const where: Prisma.IdeaWhereInput = {}
    // includeHidden from someone who cannot see hidden ideas is ignored, not an error.
    if (!(args.includeHidden && canSeeHidden(ctx))) where.hiddenAt = null
    if (args.category) where.category = args.category
    if (args.topic) where.topic = args.topic
    if (args.status) where.status = args.status

    const pageSize = clampPageSize(args.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const total = await db.idea.count({ where })
    const pageCount = Math.max(1, Math.ceil(total / pageSize))
    const page = clampPage(args.page, pageCount)

    const orderBy: Prisma.IdeaOrderByWithRelationInput[] =
      args.sort === 'NEWEST'
        ? [{ createdAt: 'desc' }]
        : [{ votes: { _count: 'desc' } }, { createdAt: 'desc' }]

    const rows = await db.idea.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize })
    return { rows, total, page, pageCount }
  },

  idea: async (_: unknown, { id }: { id: string }, ctx: Context) => {
    const row = await db.idea.findUnique({ where: { id } })
    if (!row) return null
    if (row.hiddenAt !== null && !canSeeHidden(ctx)) return null
    return row
  },
}

/** Hidden comments are excluded unless the caller can see them. */
function commentWhere(ideaId: string, ctx: Context): Prisma.IdeaCommentWhereInput {
  return canSeeHidden(ctx) ? { ideaId } : { ideaId, hiddenAt: null }
}

export const boardIdea = {
  hidden: (parent: Idea) => parent.hiddenAt !== null,
  createdAt: (parent: Idea) => parent.createdAt.toISOString(),
  author: (parent: Idea) => db.user.findUnique({ where: { id: parent.authorId } }),
  // Counts idea vote rows only; never the battle Vote model.
  voteCount: (parent: Idea) => db.ideaVote.count({ where: { ideaId: parent.id } }),
  // Only ever answers for the caller themselves, so voting stays secret.
  viewerHasVoted: async (parent: Idea, _args: unknown, ctx: Context) => {
    if (!ctx.userId) return false
    const vote = await db.ideaVote.findFirst({
      where: { ideaId: parent.id, userId: ctx.userId },
      select: { id: true },
    })
    return vote !== null
  },
  comments: (parent: Idea, _args: unknown, ctx: Context) =>
    db.ideaComment.findMany({ where: commentWhere(parent.id, ctx), orderBy: { createdAt: 'asc' } }),
  commentCount: (parent: Idea, _args: unknown, ctx: Context) =>
    db.ideaComment.count({ where: commentWhere(parent.id, ctx) }),
}

export const boardComment = {
  hidden: (parent: IdeaComment) => parent.hiddenAt !== null,
  createdAt: (parent: IdeaComment) => parent.createdAt.toISOString(),
  author: (parent: IdeaComment) => db.user.findUnique({ where: { id: parent.authorId } }),
  voteCount: (parent: IdeaComment) => db.ideaCommentVote.count({ where: { commentId: parent.id } }),
  viewerHasVoted: async (parent: IdeaComment, _args: unknown, ctx: Context) => {
    if (!ctx.userId) return false
    const vote = await db.ideaCommentVote.findFirst({
      where: { commentId: parent.id, userId: ctx.userId },
      select: { id: true },
    })
    return vote !== null
  },
}
