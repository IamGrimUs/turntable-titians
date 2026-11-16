import { db } from './db'
import { computeBattleStatus } from './battleStatus'
import { winnersOfBattle } from './battleResults'

/**
 * How many COMPLETED battles the user won (see `winnersOfBattle` for the rule). Vote counts
 * are secret while a battle is open, so unfinished battles never count, and no voter
 * identity is read: only per-entry totals.
 *
 * Four small queries, and only when a client asks for `User.battlesWon`.
 */
export async function countBattlesWon(userId: string, now: Date = new Date()): Promise<number> {
  const mine = await db.submission.findMany({ where: { userId }, select: { battleId: true } })
  if (mine.length === 0) return 0

  const battles = await db.battle.findMany({
    where: { id: { in: [...new Set(mine.map((s) => s.battleId))] } },
    select: { id: true, startDate: true, endDate: true },
  })
  const completedIds = battles
    .filter((b) => computeBattleStatus(b.startDate, b.endDate, now) === 'COMPLETED')
    .map((b) => b.id)
  if (completedIds.length === 0) return 0

  const [entries, counts] = await Promise.all([
    db.submission.findMany({
      where: { battleId: { in: completedIds } },
      select: { id: true, userId: true, battleId: true },
    }),
    db.vote.groupBy({ by: ['submissionId'], where: { battleId: { in: completedIds } }, _count: true }),
  ])
  const votesBySubmission = new Map(counts.map((c) => [c.submissionId, c._count]))

  const byBattle = new Map<string, Array<{ userId: string; votes: number }>>()
  for (const e of entries) {
    const list = byBattle.get(e.battleId) ?? []
    list.push({ userId: e.userId, votes: votesBySubmission.get(e.id) ?? 0 })
    byBattle.set(e.battleId, list)
  }

  let won = 0
  for (const list of byBattle.values()) if (winnersOfBattle(list).has(userId)) won++
  return won
}
