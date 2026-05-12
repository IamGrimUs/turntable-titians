import { Battle, Submission, Vote } from '@prisma/client'
import { GraphQLError } from 'graphql'
import { db } from './db'
import { computeBattleStatus } from './battleStatus'

interface Context {
  userId: string | null
}

function requireAuth(userId: string | null): string {
  if (!userId) throw new GraphQLError('Not authenticated', {
    extensions: { code: 'UNAUTHENTICATED' },
  })
  return userId
}

export const resolvers = {
  Query: {
    battles: () => db.battle.findMany({ orderBy: { createdAt: 'desc' } }),
    battle: (_: unknown, { id }: { id: string }) =>
      db.battle.findUnique({ where: { id } }),
    battleTypes: () =>
      db.battle
        .findMany({ distinct: ['type'], select: { type: true } })
        .then((rows) => rows.map((r) => r.type)),
    submission: (_: unknown, { id }: { id: string }) =>
      db.submission.findUnique({ where: { id } }),
    submissions: (_: unknown, { battleId }: { battleId: string }) =>
      db.submission.findMany({ where: { battleId }, orderBy: { createdAt: 'desc' } }),
    user: (_: unknown, { id }: { id: string }) =>
      db.user.findUnique({ where: { id } }),
    me: (_: unknown, __: unknown, ctx: Context) => {
      if (!ctx.userId) return null
      return db.user.findUnique({ where: { id: ctx.userId } })
    },
    health: () => ({
      status: 'ok',
      message: 'Turntable Titans GraphQL API is running',
    }),
  },

  Mutation: {
    createBattle: (
      _: unknown,
      {
        title,
        type,
        description,
        startDate,
        endDate,
      }: { title: string; type: string; description?: string; startDate: string; endDate: string },
      ctx: Context
    ) => {
      requireAuth(ctx.userId)
      return db.battle.create({
        data: { title, type, description, startDate: new Date(startDate), endDate: new Date(endDate) },
      })
    },

    createSubmission: (
      _: unknown,
      {
        battleId,
        videoUrl,
        title,
        description,
      }: { battleId: string; videoUrl: string; title?: string; description?: string },
      ctx: Context
    ) => {
      const userId = requireAuth(ctx.userId)
      return db.submission.create({
        data: { battleId, userId, videoUrl, title, description },
      })
    },

    updateProfile: async (
      _: unknown,
      {
        username,
        image,
        externalCrews,
      }: { username?: string; image?: string; externalCrews?: string[] },
      ctx: Context
    ) => {
      const userId = requireAuth(ctx.userId)
      if (username !== undefined && username !== '') {
        const existing = await db.user.findUnique({ where: { username } })
        if (existing && existing.id !== userId) {
          throw new GraphQLError('Username already taken', {
            extensions: { code: 'BAD_USER_INPUT' },
          })
        }
      } else if (username === '') {
        throw new GraphQLError('Username cannot be empty', {
          extensions: { code: 'BAD_USER_INPUT' },
        })
      }
      return db.user.update({
        where: { id: userId },
        data: {
          ...(username !== undefined && { username }),
          ...(image !== undefined && { image }),
          ...(externalCrews !== undefined && { externalCrews }),
        },
      })
    },

    vote: async (_: unknown, { submissionId }: { submissionId: string }, ctx: Context) => {
      const userId = requireAuth(ctx.userId)
      const submission = await db.submission.findUnique({
        where: { id: submissionId },
        select: { battleId: true },
      })
      if (!submission) throw new GraphQLError('Submission not found', {
        extensions: { code: 'NOT_FOUND' },
      })
      const { battleId } = submission
      const existing = await db.vote.findUnique({ where: { userId_battleId: { userId, battleId } } })
      if (existing) throw new GraphQLError('Already voted in this battle', {
        extensions: { code: 'BAD_USER_INPUT' },
      })
      try {
        return await db.vote.create({ data: { submissionId, battleId, userId } })
      } catch (e: unknown) {
        const err = e as { code?: string }
        if (err?.code === 'P2002') throw new GraphQLError('Already voted in this battle', {
          extensions: { code: 'BAD_USER_INPUT' },
        })
        throw e
      }
    },

    deleteVote: async (_: unknown, { submissionId }: { submissionId: string }, ctx: Context) => {
      const userId = requireAuth(ctx.userId)
      const submission = await db.submission.findUnique({
        where: { id: submissionId },
        select: { battleId: true },
      })
      if (!submission) return false
      const { battleId } = submission
      const vote = await db.vote.findUnique({ where: { userId_battleId: { userId, battleId } } })
      if (!vote) return false
      await db.vote.delete({ where: { id: vote.id } })
      return true
    },
  },

  Battle: {
    submissions: (parent: Battle) =>
      db.submission.findMany({ where: { battleId: parent.id } }),
    status: (parent: Battle) => computeBattleStatus(parent.startDate, parent.endDate),
    startDate: (parent: Battle) => parent.startDate.toISOString(),
    endDate: (parent: Battle) => parent.endDate.toISOString(),
    createdAt: (parent: Battle) => parent.createdAt.toISOString(),
    updatedAt: (parent: Battle) => parent.updatedAt.toISOString(),
  },

  Submission: {
    votes: (parent: Submission) =>
      db.vote.findMany({ where: { submissionId: parent.id } }),
    voteCount: (parent: Submission) =>
      db.vote.count({ where: { submissionId: parent.id } }),
    createdAt: (parent: Submission) => parent.createdAt.toISOString(),
    updatedAt: (parent: Submission) => parent.updatedAt.toISOString(),
    user: (parent: Submission) =>
      db.user.findUnique({ where: { id: parent.userId } }),
  },

  User: {
    submissions: (parent: { id: string }) =>
      db.submission.findMany({ where: { userId: parent.id } }),
    externalCrews: (parent: { externalCrews: string[] }) => parent.externalCrews,
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
  },

  Vote: {
    createdAt: (parent: Vote) => parent.createdAt.toISOString(),
  },
}
