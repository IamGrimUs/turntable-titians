import { GraphQLError } from 'graphql'
import { db } from './db'
import { requireAuth, type Context } from './context'
import { runoffPhase, tiedForFirst } from './battleOutcome'

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } })
}

function notFound(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'NOT_FOUND' } })
}

function assertRunoffOpen(endDate: Date): void {
  if (runoffPhase(endDate, new Date()) !== 'OPEN') throw badInput('The runoff is not open.')
}

/** A head to head duel (a battle with a Challenge) is never decided by a runoff: a tie is a draw. */
async function assertNotDuel(battleId: string): Promise<void> {
  const duel = await db.challenge.findUnique({ where: { battleId }, select: { id: true } })
  if (duel) throw badInput('The runoff is not open.')
}

/**
 * Runoff voting: when a completed battle ties for first, people vote again on just the tied
 * entries. One runoff vote per person per battle, separate from round-one `Vote` rows.
 */
export const runoffMutation = {
  castRunoffVote: async (_: unknown, { submissionId }: { submissionId: string }, ctx: Context) => {
    const userId = requireAuth(ctx)
    const submission = await db.submission.findUnique({
      where: { id: submissionId },
      select: { battleId: true, battle: { select: { endDate: true } } },
    })
    if (!submission) throw notFound('Submission not found')
    // The battle always comes from the submission itself, never from the client.
    const { battleId } = submission
    assertRunoffOpen(submission.battle.endDate)
    await assertNotDuel(battleId)

    const [entries, tallies] = await Promise.all([
      db.submission.findMany({ where: { battleId }, select: { id: true, userId: true } }),
      db.vote.groupBy({ by: ['submissionId'], where: { battleId }, _count: true }),
    ])
    const votesBySubmission = new Map(tallies.map((t) => [t.submissionId, t._count]))
    const candidates = tiedForFirst(entries.map((e) => ({ ...e, votes: votesBySubmission.get(e.id) ?? 0 })))

    if (!candidates.some((c) => c.id === submissionId)) throw badInput('This entry is not in the runoff.')
    if (candidates.some((c) => c.userId === userId)) throw badInput('You cannot vote in a runoff you are in.')

    await db.runoffVote.upsert({
      where: { userId_battleId: { userId, battleId } },
      create: { userId, battleId, submissionId },
      update: { submissionId },
    })
    return true
  },

  removeRunoffVote: async (_: unknown, { battleId }: { battleId: string }, ctx: Context) => {
    const userId = requireAuth(ctx)
    const battle = await db.battle.findUnique({ where: { id: battleId }, select: { endDate: true } })
    if (!battle) throw notFound('Battle not found')
    assertRunoffOpen(battle.endDate)
    await assertNotDuel(battleId)
    const { count } = await db.runoffVote.deleteMany({ where: { userId, battleId } })
    return count > 0
  },
}
