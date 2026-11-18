import { db } from './db'
import { loadCompletedBattles } from './standings'

/**
 * How many COMPLETED battles the user won, as decided by `resolveBattle` (round one, then the
 * runoff if the battle tied for first). Vote counts are secret while a battle is open, so
 * unfinished battles never count, and a battle whose runoff is still open counts for no one.
 * No voter identity is read: only per-entry totals.
 *
 * A few small queries, and only when a client asks for `User.battlesWon`.
 */
export async function countBattlesWon(userId: string, now: Date = new Date()): Promise<number> {
  const mine = await db.submission.findMany({ where: { userId }, select: { battleId: true } })
  if (mine.length === 0) return 0

  const battles = await loadCompletedBattles([...new Set(mine.map((s) => s.battleId))], now)
  return battles.filter((b) => b.resolution.winnerUserIds.has(userId)).length
}
