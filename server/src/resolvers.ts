import { Battle, Submission, Vote } from '@prisma/client'
import { GraphQLError } from 'graphql'
import { db } from './db'
import { computeBattleStatus } from './battleStatus'
import {
  LIMITS,
  cleanCrews,
  cleanHttpsUrl,
  cleanMultiLine,
  cleanSingleLine,
  cleanUsername,
  getAllowedImageHosts,
  parseBattleDates,
} from './validation'

interface Context {
  userId: string | null
}

function requireAuth(userId: string | null): string {
  if (!userId) throw new GraphQLError('Not authenticated', {
    extensions: { code: 'UNAUTHENTICATED' },
  })
  return userId
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
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
      message: 'Battle Skratch GraphQL API is running',
    }),
  },

  Mutation: {
    createBattle: async (
      _: unknown,
      {
        title,
        type,
        description,
        startDate,
        endDate,
      }: { title: string; type: string; description?: string | null; startDate: string; endDate: string },
      ctx: Context
    ) => {
      requireAuth(ctx.userId)
      const cleanTitle = cleanSingleLine(title, 'Title', { max: LIMITS.title, required: true })!
      const cleanType = cleanSingleLine(type, 'Battle type', { max: LIMITS.battleType, required: true })!
      const cleanDescription = cleanMultiLine(description, 'Description', { max: LIMITS.description })
      const { start, end } = parseBattleDates(startDate, endDate)
      return db.battle.create({
        data: { title: cleanTitle, type: cleanType, description: cleanDescription, startDate: start, endDate: end },
      })
    },

    createSubmission: async (
      _: unknown,
      {
        battleId,
        videoUrl,
        title,
        description,
      }: { battleId: string; videoUrl: string; title?: string | null; description?: string | null },
      ctx: Context
    ) => {
      const userId = requireAuth(ctx.userId)
      const cleanUrl = cleanHttpsUrl(videoUrl, 'Video link', { max: LIMITS.url })
      const cleanTitle = cleanSingleLine(title, 'Title', { max: LIMITS.title })
      const cleanDescription = cleanMultiLine(description, 'Description', { max: LIMITS.description })

      const battle = await db.battle.findUnique({
        where: { id: battleId },
        select: { startDate: true, endDate: true },
      })
      if (!battle) throw new GraphQLError('Battle not found', { extensions: { code: 'NOT_FOUND' } })

      // Entries are only open while the battle is running, same rule as voting.
      const status = computeBattleStatus(battle.startDate, battle.endDate)
      if (status !== 'ACTIVE') {
        throw new GraphQLError(
          status === 'COMPLETED' ? 'Battle has ended' : 'Battle has not started yet',
          { extensions: { code: 'BAD_USER_INPUT' } }
        )
      }

      // The web form already hides the entry button after you enter; enforce it here too.
      const existing = await db.submission.findFirst({
        where: { battleId, userId },
        select: { id: true },
      })
      if (existing) {
        throw new GraphQLError('You have already submitted an entry to this battle.', {
          extensions: { code: 'BAD_USER_INPUT' },
        })
      }

      return db.submission.create({
        data: { battleId, userId, videoUrl: cleanUrl, title: cleanTitle, description: cleanDescription },
      })
    },

    updateProfile: async (
      _: unknown,
      {
        username,
        image,
        externalCrews,
      }: { username?: string | null; image?: string | null; externalCrews?: string[] | null },
      ctx: Context
    ) => {
      const userId = requireAuth(ctx.userId)

      // Rules apply only to values that are actually changing, so an account created
      // before these rules existed can still save its other settings.
      const current = await db.user.findUnique({
        where: { id: userId },
        select: { username: true, image: true, externalCrews: true },
      })

      let nextUsername: string | undefined
      if (username !== undefined && username !== null) {
        const trimmed = username.trim()
        if (trimmed === '') {
          throw new GraphQLError('Username cannot be empty', {
            extensions: { code: 'BAD_USER_INPUT' },
          })
        }
        if (trimmed !== current?.username) {
          nextUsername = cleanUsername(trimmed)
          // Case-insensitive, so "Admin" cannot impersonate "admin".
          const taken = await db.user.findFirst({
            where: { username: { equals: nextUsername, mode: 'insensitive' }, NOT: { id: userId } },
            select: { id: true },
          })
          if (taken) {
            throw new GraphQLError('Username already taken', {
              extensions: { code: 'BAD_USER_INPUT' },
            })
          }
        } else {
          nextUsername = trimmed
        }
      }

      let nextImage: string | null | undefined
      if (image !== undefined) {
        if (image === null || image.trim() === '') {
          nextImage = null
        } else if (image === current?.image) {
          nextImage = image
        } else {
          nextImage = cleanHttpsUrl(image, 'Profile image', {
            max: LIMITS.url,
            allowedHosts: getAllowedImageHosts(),
          })
        }
      }

      let nextCrews: string[] | undefined
      if (externalCrews !== undefined && externalCrews !== null) {
        nextCrews = sameList(externalCrews, current?.externalCrews ?? [])
          ? externalCrews
          : cleanCrews(externalCrews)
      }

      return db.user.update({
        where: { id: userId },
        data: {
          ...(nextUsername !== undefined && { username: nextUsername }),
          ...(nextImage !== undefined && { image: nextImage }),
          ...(nextCrews !== undefined && { externalCrews: nextCrews }),
        },
      })
    },

    vote: async (_: unknown, { submissionId }: { submissionId: string }, ctx: Context) => {
      const userId = requireAuth(ctx.userId)
      const submission = await db.submission.findUnique({
        where: { id: submissionId },
        select: {
          battleId: true,
          battle: { select: { startDate: true, endDate: true } },
        },
      })
      if (!submission) throw new GraphQLError('Submission not found', {
        extensions: { code: 'NOT_FOUND' },
      })
      const { battleId } = submission
      const battleStatus = computeBattleStatus(submission.battle.startDate, submission.battle.endDate)
      if (battleStatus !== 'ACTIVE') throw new GraphQLError(
        battleStatus === 'COMPLETED' ? 'Battle has ended' : 'Battle has not started yet',
        { extensions: { code: 'BAD_USER_INPUT' } }
      )
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
        select: {
          battleId: true,
          battle: { select: { startDate: true, endDate: true } },
        },
      })
      if (!submission) return false
      const { battleId } = submission
      const battleStatus = computeBattleStatus(submission.battle.startDate, submission.battle.endDate)
      if (battleStatus !== 'ACTIVE') throw new GraphQLError(
        battleStatus === 'COMPLETED' ? 'Battle has ended' : 'Battle has not started yet',
        { extensions: { code: 'BAD_USER_INPUT' } }
      )
      const vote = await db.vote.findUnique({ where: { userId_battleId: { userId, battleId } } })
      if (!vote) return false
      await db.vote.delete({ where: { id: vote.id } })
      return true
    },
  },

  Battle: {
    // Oldest first. The order must never depend on votes, or it would reveal who is ahead.
    submissions: (parent: Battle) =>
      db.submission.findMany({ where: { battleId: parent.id }, orderBy: { createdAt: 'asc' } }),
    status: (parent: Battle) => computeBattleStatus(parent.startDate, parent.endDate),
    startDate: (parent: Battle) => parent.startDate.toISOString(),
    endDate: (parent: Battle) => parent.endDate.toISOString(),
    createdAt: (parent: Battle) => parent.createdAt.toISOString(),
    updatedAt: (parent: Battle) => parent.updatedAt.toISOString(),
  },

  Submission: {
    // Vote counts stay secret until the battle is over, for everyone (entrants included).
    // Anything other than a clearly COMPLETED battle, including a missing one, returns null.
    voteCount: async (parent: Submission) => {
      const battle = await db.battle.findUnique({
        where: { id: parent.battleId },
        select: { startDate: true, endDate: true },
      })
      if (!battle || computeBattleStatus(battle.startDate, battle.endDate) !== 'COMPLETED') return null
      return db.vote.count({ where: { submissionId: parent.id } })
    },
    // Only ever answers for the caller themselves, so ballots stay secret.
    viewerHasVoted: async (parent: Submission, _args: unknown, ctx: Context) => {
      if (!ctx.userId) return false
      const vote = await db.vote.findFirst({
        where: { submissionId: parent.id, userId: ctx.userId },
        select: { id: true },
      })
      return vote !== null
    },
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
