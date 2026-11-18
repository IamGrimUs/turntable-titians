import type { Battle, User } from '@prisma/client'
import { computeBattleStatus } from './battleStatus'
import { createBatcher } from './batcher'
import type { Context } from './context'
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
 * is open. Who counts as a winner is decided in one place, `winnersOfBattle`.
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

export const standingsQuery = {
  hallOfFame: () => loadHallOfFame(),
}

/** `User.record`: only runs when a client asks for it. */
export const userRecord = (parent: { id: string }) => loadUserRecord(parent.id)
