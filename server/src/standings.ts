import type { User } from '@prisma/client'
import { db } from './db'
import { computeBattleStatus } from './battleStatus'
import { winnersOfBattle } from './battleResults'
import {
  placesInBattle,
  rankChampions,
  summarizeRecord,
  type CompletedBattleEntries,
  type UserRecord,
} from './battlePlacement'

/**
 * Loads standings from the database. Vote counts are secret while a battle is open, so only
 * COMPLETED battles are ever read, and only per-entry totals (never who voted).
 *
 * Known scale limit: `loadHallOfFame` reads every completed battle on each call. Fine for now;
 * move the tally to SQL if the number of battles grows large.
 */

/**
 * Completed battles (from `battleIds`, or every battle that has ended) with each entry's
 * vote total. "Completed" is decided by `computeBattleStatus`, like everywhere else.
 */
export async function loadCompletedBattles(
  battleIds?: string[],
  now: Date = new Date()
): Promise<CompletedBattleEntries[]> {
  const battles = await db.battle.findMany({
    // A battle that has ended is a superset of "completed"; computeBattleStatus makes the final call.
    where: battleIds ? { id: { in: battleIds } } : { endDate: { lt: now } },
    select: { id: true, startDate: true, endDate: true },
  })
  const completed = battles.filter((b) => computeBattleStatus(b.startDate, b.endDate, now) === 'COMPLETED')
  if (completed.length === 0) return []
  const ids = completed.map((b) => b.id)

  const [entries, counts] = await Promise.all([
    db.submission.findMany({ where: { battleId: { in: ids } }, select: { id: true, userId: true, battleId: true } }),
    db.vote.groupBy({ by: ['submissionId'], where: { battleId: { in: ids } }, _count: true }),
  ])
  const votesBySubmission = new Map(counts.map((c) => [c.submissionId, c._count]))

  const byBattle = new Map<string, Array<{ userId: string; votes: number }>>()
  for (const e of entries) {
    const list = byBattle.get(e.battleId) ?? []
    list.push({ userId: e.userId, votes: votesBySubmission.get(e.id) ?? 0 })
    byBattle.set(e.battleId, list)
  }
  return completed.map((b) => ({ id: b.id, endDate: b.endDate, entries: byBattle.get(b.id) ?? [] }))
}

function byName(a: User, b: User): number {
  return (a.username ?? '').localeCompare(b.username ?? '') || a.id.localeCompare(b.id)
}

export interface BattleOutcome {
  winners: User[]
  /** The vote total of the winning entry (the tied top total on a tie). Null when nobody won. */
  winningVotes: number | null
}

/**
 * The outcome of each given battle: its winners as users and the winning vote total. Two
 * queries for all battles plus one user lookup. Every completed battle gets an entry (empty
 * when nobody won); battles that are not completed are left out. Ties list every tied winner.
 */
export async function loadOutcomesByBattle(battleIds: string[], now: Date = new Date()): Promise<Map<string, BattleOutcome>> {
  const battles = await loadCompletedBattles(battleIds, now)
  const winnerIds = new Map(battles.map((b) => [b.id, winnersOfBattle(b.entries)]))
  const allIds = [...new Set([...winnerIds.values()].flatMap((s) => [...s]))]
  const users = allIds.length > 0 ? await db.user.findMany({ where: { id: { in: allIds } } }) : []
  const userById = new Map(users.map((u) => [u.id, u]))

  const result = new Map<string, BattleOutcome>()
  for (const battle of battles) {
    const ids = winnerIds.get(battle.id)!
    const winners = [...ids].map((id) => userById.get(id)).filter((u): u is User => !!u).sort(byName)
    const winningVotes = ids.size > 0 ? Math.max(...battle.entries.map((e) => e.votes)) : null
    result.set(battle.id, { winners, winningVotes })
  }
  return result
}

export interface Champion {
  rank: number
  user: User
  wins: number
  battlesEntered: number
  lastWinAt: string
}

/** The Hall of Fame: everyone with at least one win, ranked (see `rankChampions`). */
export async function loadHallOfFame(now: Date = new Date()): Promise<Champion[]> {
  const rows = rankChampions(await loadCompletedBattles(undefined, now))
  if (rows.length === 0) return []
  const users = await db.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } } })
  const userById = new Map(users.map((u) => [u.id, u]))
  return rows.flatMap((r) => {
    const user = userById.get(r.userId)
    return user
      ? [{ rank: r.rank, user, wins: r.wins, battlesEntered: r.battlesEntered, lastWinAt: r.lastWinAt.toISOString() }]
      : []
  })
}

/** One user's record across completed battles. Only runs when a client asks for `User.record`. */
export async function loadUserRecord(userId: string, now: Date = new Date()): Promise<UserRecord> {
  const mine = await db.submission.findMany({ where: { userId }, select: { battleId: true } })
  if (mine.length === 0) return summarizeRecord([])
  const battles = await loadCompletedBattles([...new Set(mine.map((s) => s.battleId))], now)
  return summarizeRecord(
    battles.map((b) => ({
      battleId: b.id,
      endDate: b.endDate,
      place: placesInBattle(b.entries).get(userId) ?? null,
    }))
  )
}
