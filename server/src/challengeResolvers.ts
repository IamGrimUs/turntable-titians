import type { Challenge } from '@prisma/client'
import { GraphQLError } from 'graphql'
import { db } from './db'
import { requireAuth, type Context } from './context'
import { isSuspended } from './suspension'
import {
  cleanChallengeInput,
  createBlockReason,
  effectiveStatus,
  expiryFrom,
  battleDatesForAccept,
  viewerRole,
} from './challengeRules'
import { badInput, cleanHttpsUrl, LIMITS } from './validation'

/**
 * The challenger's video link is deliberately NOT part of the parent row: every read below
 * selects these columns only, and `challengerVideoUrl` has its own field resolver that hands
 * the link to the challenger (and only while the challenge is still waiting). The opponent
 * must not see it before they accept.
 */
export type ChallengeParent = Omit<Challenge, 'challengerVideoUrl'>

export const SAFE_SELECT = {
  id: true,
  challengerId: true,
  opponentId: true,
  title: true,
  message: true,
  votingDays: true,
  status: true,
  expiresAt: true,
  respondedAt: true,
  battleId: true,
  createdAt: true,
} as const

const DAY_MS = 24 * 60 * 60 * 1000

// One message for a missing id, a stranger and an anonymous caller: no signal about which it was.
export function notFound(): GraphQLError {
  return new GraphQLError('Challenge not found', { extensions: { code: 'NOT_FOUND' } })
}

export function isSerializationFailure(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2034'
}

export const challengeQuery = {
  /** Visible only to the two DJs. Anyone else, anonymous callers included, gets the same NOT_FOUND as a missing id. */
  challenge: async (_: unknown, { id }: { id: string }, ctx: Context): Promise<ChallengeParent> => {
    if (!ctx.userId) throw notFound()
    const found = await db.challenge.findUnique({ where: { id }, select: SAFE_SELECT })
    if (!found || viewerRole(found, ctx.userId) === null) throw notFound()
    return found
  },

  myChallenges: async (_: unknown, __: unknown, ctx: Context): Promise<ChallengeParent[]> => {
    if (!ctx.userId) return []
    return db.challenge.findMany({
      where: { OR: [{ challengerId: ctx.userId }, { opponentId: ctx.userId }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: SAFE_SELECT,
    })
  },

  /** Challenges sent to me that I can still answer. */
  challengesWaiting: async (_: unknown, __: unknown, ctx: Context): Promise<number> => {
    if (!ctx.userId) return 0
    return db.challenge.count({
      where: { opponentId: ctx.userId, status: 'PENDING', expiresAt: { gt: new Date() } },
    })
  },
}

type Answer = 'DECLINED' | 'WITHDRAWN'

/**
 * Decline (opponent) or withdraw (challenger): only while the challenge is waiting. The status
 * change is a compare-and-set, so it can never overwrite an accept that won the race or an expiry.
 */
async function answerChallenge(
  id: string,
  ctx: Context,
  to: Answer,
  allowed: 'CHALLENGER' | 'OPPONENT',
  wrongSide: string
): Promise<ChallengeParent> {
  const userId = requireAuth(ctx)
  const found = await db.challenge.findUnique({ where: { id }, select: SAFE_SELECT })
  const role = found ? viewerRole(found, userId) : null
  if (!found || role === null) throw notFound()
  if (role !== allowed) throw badInput(wrongSide)

  const now = new Date()
  const { count } = await db.challenge.updateMany({
    where: { id, status: 'PENDING', expiresAt: { gt: now } },
    data: { status: to, respondedAt: now },
  })
  if (count === 0) throw badInput('This challenge is no longer waiting for an answer.')

  const updated = await db.challenge.findUnique({ where: { id }, select: SAFE_SELECT })
  if (!updated) throw notFound()
  return updated
}

export const challengeMutation = {
  createChallenge: async (
    _: unknown,
    args: {
      opponentUsername: string
      title: string
      message?: string | null
      videoUrl: string
      votingDays: number
    },
    ctx: Context
  ): Promise<ChallengeParent> => {
    const userId = requireAuth(ctx)
    const input = cleanChallengeInput(args)
    if (!ctx.username) throw badInput('Choose a username before challenging someone.')

    const now = new Date()
    try {
      // The checks and the create share one Serializable transaction, so two simultaneous
      // requests cannot both pass the "one waiting per pair" and rate checks.
      return await db.$transaction(
        async (tx) => {
          // Usernames are unique ignoring case, so "djopp" must find "DJOpp".
          const opponent = await tx.user.findFirst({
            where: { username: { equals: input.opponentUsername, mode: 'insensitive' } },
            select: { id: true, suspendedAt: true, suspendedUntil: true },
          })
          if (!opponent) throw badInput('No DJ with that username.')
          if (opponent.id === userId) throw badInput("You can't challenge yourself.")
          if (isSuspended(opponent, now)) throw badInput("That DJ can't be challenged right now.")

          const waiting = { status: 'PENDING' as const, expiresAt: { gt: now } }
          const [pendingOutgoing, createdLast24h, pair, lastDeclined] = await Promise.all([
            tx.challenge.count({ where: { challengerId: userId, ...waiting } }),
            tx.challenge.count({
              where: { challengerId: userId, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
            }),
            // Either direction: A challenging B is blocked by a waiting challenge from B to A.
            tx.challenge.findFirst({
              where: {
                ...waiting,
                OR: [
                  { challengerId: userId, opponentId: opponent.id },
                  { challengerId: opponent.id, opponentId: userId },
                ],
              },
              select: { id: true },
            }),
            tx.challenge.findFirst({
              // respondedAt is set on every decline; excluding NULLs keeps Postgres NULL ordering
              // (NULLs sort first when descending) from hiding the real latest decline.
              where: { challengerId: userId, opponentId: opponent.id, status: 'DECLINED', respondedAt: { not: null } },
              orderBy: { respondedAt: 'desc' },
              select: { respondedAt: true },
            }),
          ])

          const blocked = createBlockReason({
            pendingOutgoing,
            createdLast24h,
            pairPending: pair !== null,
            lastDeclinedAt: lastDeclined?.respondedAt ?? null,
            now,
          })
          if (blocked) throw badInput(blocked)

          return tx.challenge.create({
            data: {
              challengerId: userId,
              opponentId: opponent.id,
              title: input.title,
              message: input.message,
              challengerVideoUrl: input.videoUrl,
              votingDays: input.votingDays,
              expiresAt: expiryFrom(now),
            },
            select: SAFE_SELECT,
          })
        },
        { isolationLevel: 'Serializable' }
      )
    } catch (err) {
      if (isSerializationFailure(err)) throw badInput('Something went wrong, please try again.')
      throw err
    }
  },

  /**
   * The opponent accepts with their own entry, which opens a public Head to Head battle with
   * exactly two entries. Everything after the pre-checks is ONE transaction that starts with a
   * compare-and-set on the status, so of two simultaneous accepts (or an accept racing a withdraw,
   * a decline or the expiry) exactly one gets past it and the other writes nothing.
   */
  acceptChallenge: async (
    _: unknown,
    args: { id: string; videoUrl: string },
    ctx: Context
  ): Promise<ChallengeParent> => {
    const userId = requireAuth(ctx)
    const videoUrl = cleanHttpsUrl(args.videoUrl, 'Video link', { max: LIMITS.url })
    const { id } = args

    // A stranger and a missing id get the same NOT_FOUND, before anything is written. The challenger's
    // video link is not selected here (SAFE_SELECT).
    const found = await db.challenge.findUnique({ where: { id }, select: SAFE_SELECT })
    const role = found ? viewerRole(found, userId) : null
    if (!found || role === null) throw notFound()
    if (role === 'CHALLENGER') throw badInput("You can't accept your own challenge.")

    const now = new Date()
    try {
      return await db.$transaction(async (tx) => {
        const { count } = await tx.challenge.updateMany({
          where: { id, opponentId: userId, status: 'PENDING', expiresAt: { gt: now } },
          data: { status: 'ACCEPTED', respondedAt: now },
        })
        if (count === 0) throw badInput('This challenge is no longer waiting for an answer.')

        // The stored link is read here only to become the challenger's entry; it is never returned.
        const challenge = await tx.challenge.findUnique({
          where: { id },
          select: { challengerId: true, title: true, message: true, votingDays: true, challengerVideoUrl: true },
        })
        const challenger = challenge
          ? await tx.user.findUnique({
              where: { id: challenge.challengerId },
              select: { suspendedAt: true, suspendedUntil: true },
            })
          : null
        // Throwing here rolls the compare-and-set back, so a refused accept leaves the challenge waiting.
        if (!challenge || !challenger || isSuspended(challenger, now)) {
          throw badInput('This challenge is no longer available.')
        }

        const { start, end } = battleDatesForAccept(now, challenge.votingDays)
        const battle = await tx.battle.create({
          data: {
            title: challenge.title,
            type: 'Head to Head',
            description: challenge.message,
            startDate: start,
            endDate: end,
            submissions: {
              create: [
                { userId: challenge.challengerId, videoUrl: challenge.challengerVideoUrl },
                { userId, videoUrl },
              ],
            },
          },
          select: { id: true },
        })

        return tx.challenge.update({ where: { id }, data: { battleId: battle.id }, select: SAFE_SELECT })
      })
    } catch (err) {
      if (err instanceof GraphQLError) throw err
      // Unexpected failure (the transaction has rolled back). Prisma error messages echo the query
      // arguments, which include the challenger's hidden video link, so neither the caller nor the
      // log gets the original: only its name and code.
      const e = err as { name?: unknown; code?: unknown }
      console.error('[challenge] accept failed:', e?.name, e?.code)
      throw new Error('Could not open the duel.')
    }
  },

  declineChallenge: (_: unknown, { id }: { id: string }, ctx: Context) =>
    answerChallenge(id, ctx, 'DECLINED', 'OPPONENT', 'Only the DJ who was challenged can decline.'),

  withdrawChallenge: (_: unknown, { id }: { id: string }, ctx: Context) =>
    answerChallenge(id, ctx, 'WITHDRAWN', 'CHALLENGER', 'Only the DJ who sent the challenge can withdraw it.'),
}

export const challengeFields = {
  status: (parent: ChallengeParent) => effectiveStatus(parent),
  message: (parent: ChallengeParent) => parent.message ?? null,
  expiresAt: (parent: ChallengeParent) => parent.expiresAt.toISOString(),
  createdAt: (parent: ChallengeParent) => parent.createdAt.toISOString(),
  respondedAt: (parent: ChallengeParent) => parent.respondedAt?.toISOString() ?? null,
  challenger: (parent: ChallengeParent) => db.user.findUnique({ where: { id: parent.challengerId } }),
  opponent: (parent: ChallengeParent) => db.user.findUnique({ where: { id: parent.opponentId } }),
  viewerRole: (parent: ChallengeParent, _args: unknown, ctx: Context) => {
    const role = viewerRole(parent, ctx.userId)
    if (role === null) throw notFound()
    return role
  },
  battleId: (parent: ChallengeParent) => (effectiveStatus(parent) === 'ACCEPTED' ? parent.battleId : null),

  /**
   * The challenger's own entry, hidden from everyone else until the opponent accepts (after that
   * it is public only as a Submission). Returned only to the challenger while the challenge is
   * waiting; never read from the database for anyone else.
   */
  challengerVideoUrl: async (parent: ChallengeParent, _args: unknown, ctx: Context): Promise<string | null> => {
    if (!ctx.userId || ctx.userId !== parent.challengerId) return null
    if (effectiveStatus(parent) !== 'PENDING') return null
    const row = await db.challenge.findUnique({ where: { id: parent.id }, select: { challengerVideoUrl: true } })
    return row?.challengerVideoUrl ?? null
  },
}
