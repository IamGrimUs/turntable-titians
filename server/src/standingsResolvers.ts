import type { Battle, User } from '@prisma/client'
import { computeBattleStatus } from './battleStatus'
import { createBatcher } from './batcher'
import type { Context } from './context'
import { db } from './db'
import { runoffWindow } from './battleOutcome'
import { loadHallOfFame, loadOutcomesByBattle, loadUserRecord, type BattleOutcome } from './standings'

type OutcomeFor = (battleId: string) => Promise<BattleOutcome | undefined>

// One batcher per request (the context object lives exactly as long as the request), so a
// list of battles loads all its winners together instead of one query set per battle.
const loaders = new WeakMap<object, OutcomeFor>()

function outcomeLoader(ctx: Context | undefined): OutcomeFor {
  const make = (): OutcomeFor => createBatcher<BattleOutcome>((ids) => loadOutcomesByBattle(ids))
  if (!ctx) return make()
  let loader = loaders.get(ctx)
  if (!loader) {
    loader = make()
    loaders.set(ctx, loader)
  }
  return loader
}

/**
 * `Battle.winners`. Empty unless the battle is COMPLETED, so nothing is revealed while voting
 * is open. Who counts as a winner (round one, then the runoff on a tie for first) is decided in one place, `resolveBattle`.
 */
export async function battleWinners(parent: Battle, _args: unknown, ctx?: Context): Promise<User[]> {
  if (computeBattleStatus(parent.startDate, parent.endDate) !== 'COMPLETED') return []
  return (await outcomeLoader(ctx)(parent.id))?.winners ?? []
}

/** `Battle.winningVotes`: shares the batch with `winners`. Null unless completed with a winner. */
export async function battleWinningVotes(parent: Battle, _args: unknown, ctx?: Context): Promise<number | null> {
  if (computeBattleStatus(parent.startDate, parent.endDate) !== 'COMPLETED') return null
  return (await outcomeLoader(ctx)(parent.id))?.winningVotes ?? null
}

type RunoffOutcome = NonNullable<BattleOutcome['runoff']>

/** What `Battle.runoff` returns; the `Runoff` field resolvers below work from this. */
export interface RunoffParent {
  battleId: string
  status: RunoffOutcome['status']
  opensAt: string
  endsAt: string
  candidates: RunoffOutcome['candidates']
}

/**
 * `Battle.runoff`. Null unless the battle is COMPLETED and tied for first. Shares the batch with
 * `winners`, so a list of battles is still one outcome read. Candidate votes are already null
 * while the runoff is OPEN (see `resolveBattle`), and the order is oldest entry first.
 */
export async function battleRunoff(parent: Battle, _args: unknown, ctx?: Context): Promise<RunoffParent | null> {
  if (computeBattleStatus(parent.startDate, parent.endDate) !== 'COMPLETED') return null
  const runoff = (await outcomeLoader(ctx)(parent.id))?.runoff
  if (!runoff) return null
  const { opensAt, endsAt } = runoffWindow(parent.endDate)
  return {
    battleId: parent.id,
    status: runoff.status,
    opensAt: opensAt.toISOString(),
    endsAt: endsAt.toISOString(),
    candidates: runoff.candidates,
  }
}

/** The `Runoff` fields. The two viewer fields are private to the caller and only run when asked. */
export const runoffFields = {
  /** The caller's own choice only; anonymous callers get null without a query. */
  viewerVoteSubmissionId: async (parent: RunoffParent, _args: unknown, ctx: Context): Promise<string | null> => {
    if (!ctx.userId) return null
    const vote = await db.runoffVote.findUnique({
      where: { userId_battleId: { userId: ctx.userId, battleId: parent.battleId } },
      select: { submissionId: true },
    })
    return vote?.submissionId ?? null
  },
  /** Signed in, not suspended, the runoff is OPEN and the caller owns none of the candidate entries. */
  viewerCanVote: (parent: RunoffParent, _args: unknown, ctx: Context): boolean =>
    !!ctx.userId &&
    !ctx.suspension &&
    parent.status === 'OPEN' &&
    !parent.candidates.some((c) => c.userId === ctx.userId),
}

export const runoffCandidateFields = {
  // Known limit: this is one small query per candidate, only for tied battles. Clients should
  // ask for `candidates.submission` on the detail page, not on every list of battles.
  submission: (parent: RunoffOutcome['candidates'][number]) => db.submission.findUnique({ where: { id: parent.id } }),
}

export const standingsQuery = {
  hallOfFame: () => loadHallOfFame(),
}

/** `User.record`: only runs when a client asks for it. */
export const userRecord = (parent: { id: string }) => loadUserRecord(parent.id)
