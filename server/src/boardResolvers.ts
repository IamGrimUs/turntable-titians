import type { Idea, IdeaCategory, IdeaComment, IdeaStatus, IdeaTopic, Prisma } from '@prisma/client'
import { GraphQLError } from 'graphql'
import { db } from './db'
import { requireAuth, type Context } from './context'
import { BOARD_LIMITS, cleanCommentBody, cleanIdeaInput, dayAgo } from './boardRules'
import { badInput } from './validation'
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

// ---------------------------------------------------------------------------------------------
// Member mutations. Every one calls requireAuth first (anonymous -> UNAUTHENTICATED, suspended ->
// FORBIDDEN). A hidden idea or comment (or a comment under a hidden idea) behaves as if it did
// not exist for anyone who cannot see hidden items, so a mutation can never confirm or return one.
// ---------------------------------------------------------------------------------------------

function notFound(what: string): GraphQLError {
  return new GraphQLError(`${what} not found`, { extensions: { code: 'NOT_FOUND' } })
}

/** Signed in, not suspended, and has chosen a username. Returns the user id. */
function requireMember(ctx: Context): string {
  const userId = requireAuth(ctx)
  if (!ctx.username) {
    throw new GraphQLError('Choose a username first.', { extensions: { code: 'FORBIDDEN' } })
  }
  return userId
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'P2002'
}

const alreadyVoted = () => badInput('You already voted for this.')

/** The idea, or NOT_FOUND when it is missing or hidden from this caller. */
async function loadIdea(id: string, ctx: Context): Promise<Idea> {
  const row = await db.idea.findUnique({ where: { id } })
  if (!row || (row.hiddenAt !== null && !canSeeHidden(ctx))) throw notFound('Idea')
  return row
}

/** The comment, or NOT_FOUND when it or its idea is missing or hidden from this caller. */
async function loadComment(id: string, ctx: Context): Promise<IdeaComment> {
  const found = await db.ideaComment.findUnique({
    where: { id },
    include: { idea: { select: { hiddenAt: true } } },
  })
  if (!found) throw notFound('Comment')
  const { idea: parentIdea, ...row } = found
  if ((row.hiddenAt !== null || parentIdea.hiddenAt !== null) && !canSeeHidden(ctx)) throw notFound('Comment')
  return row
}

export const boardMutation = {
  createIdea: async (
    _: unknown,
    args: { title: string; body: string; category: IdeaCategory; topic?: IdeaTopic | null },
    ctx: Context
  ) => {
    const userId = requireMember(ctx)
    const input = cleanIdeaInput(args)
    const since = dayAgo()
    // Hidden ideas count toward the cap and the duplicate check, so hiding one frees no slot.
    const recent = await db.idea.count({ where: { authorId: userId, createdAt: { gte: since } } })
    if (recent >= BOARD_LIMITS.ideasPerDay) {
      throw badInput(`You can post up to ${BOARD_LIMITS.ideasPerDay} ideas a day. Try again tomorrow.`)
    }
    const duplicate = await db.idea.findFirst({
      where: {
        authorId: userId,
        createdAt: { gte: since },
        title: { equals: input.title, mode: 'insensitive' },
      },
      select: { id: true },
    })
    if (duplicate) throw badInput('You already posted an idea with this title.')
    return db.idea.create({ data: { ...input, authorId: userId } })
  },

  deleteIdea: async (_: unknown, { id }: { id: string }, ctx: Context) => {
    const userId = requireMember(ctx)
    // A hidden idea is NOT_FOUND for non-moderators, its author included: no feedback signal.
    const row = await loadIdea(id, ctx)
    if (row.authorId !== userId) {
      throw new GraphQLError('You can only delete your own ideas.', { extensions: { code: 'FORBIDDEN' } })
    }
    await db.idea.delete({ where: { id } })
    return true
  },

  voteIdea: async (_: unknown, { ideaId }: { ideaId: string }, ctx: Context) => {
    const userId = requireMember(ctx)
    const row = await loadIdea(ideaId, ctx)
    const existing = await db.ideaVote.findUnique({ where: { ideaId_userId: { ideaId, userId } } })
    if (existing) throw alreadyVoted()
    try {
      await db.ideaVote.create({ data: { ideaId, userId } })
    } catch (e) {
      if (isUniqueViolation(e)) throw alreadyVoted()
      throw e
    }
    return row
  },

  unvoteIdea: async (_: unknown, { ideaId }: { ideaId: string }, ctx: Context) => {
    const userId = requireMember(ctx)
    const row = await loadIdea(ideaId, ctx)
    await db.ideaVote.deleteMany({ where: { ideaId, userId } })
    return row
  },

  createComment: async (_: unknown, args: { ideaId: string; body: string }, ctx: Context) => {
    const userId = requireMember(ctx)
    const body = cleanCommentBody(args.body)
    await loadIdea(args.ideaId, ctx)
    const since = dayAgo()
    const recent = await db.ideaComment.count({ where: { authorId: userId, createdAt: { gte: since } } })
    if (recent >= BOARD_LIMITS.commentsPerDay) {
      throw badInput(`You can post up to ${BOARD_LIMITS.commentsPerDay} comments a day. Try again tomorrow.`)
    }
    const duplicate = await db.ideaComment.findFirst({
      where: { authorId: userId, createdAt: { gte: since }, body: { equals: body, mode: 'insensitive' } },
      select: { id: true },
    })
    if (duplicate) throw badInput('You already posted this comment.')
    return db.ideaComment.create({ data: { ideaId: args.ideaId, authorId: userId, body } })
  },

  deleteComment: async (_: unknown, { id }: { id: string }, ctx: Context) => {
    const userId = requireMember(ctx)
    const row = await loadComment(id, ctx)
    if (row.authorId !== userId) {
      throw new GraphQLError('You can only delete your own comments.', { extensions: { code: 'FORBIDDEN' } })
    }
    await db.ideaComment.delete({ where: { id } })
    return true
  },

  voteComment: async (_: unknown, { commentId }: { commentId: string }, ctx: Context) => {
    const userId = requireMember(ctx)
    const row = await loadComment(commentId, ctx)
    const existing = await db.ideaCommentVote.findUnique({ where: { commentId_userId: { commentId, userId } } })
    if (existing) throw alreadyVoted()
    try {
      await db.ideaCommentVote.create({ data: { commentId, userId } })
    } catch (e) {
      if (isUniqueViolation(e)) throw alreadyVoted()
      throw e
    }
    return row
  },

  unvoteComment: async (_: unknown, { commentId }: { commentId: string }, ctx: Context) => {
    const userId = requireMember(ctx)
    const row = await loadComment(commentId, ctx)
    await db.ideaCommentVote.deleteMany({ where: { commentId, userId } })
    return row
  },
}
