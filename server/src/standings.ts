import type { User } from '@prisma/client'
import { db } from './db'
import { computeBattleStatus } from './battleStatus'
import { regularBattleWhere } from './battleKind'
import { resolveBattle, tiedForFirst, type BattleResolution, type OutcomeEntry } from './battleOutcome'
import {
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

export interface CompletedBattle {
  id: string
  endDate: Date
  entries: OutcomeEntry[]
  /** Who won and who placed where, runoff included: the single answer every consumer uses. */
  resolution: BattleResolution
}

/**
 * Completed battles (from `battleIds`, or every battle that has ended) with each entry's
 * vote total and the resolved outcome. "Completed" is decided by `computeBattleStatus`, like
 * everywhere else. Head to head duels are never included (see `regularBattleWhere`). Runoff tallies are read with one extra query, and only when at least one
 * of these battles ties for first.
 */
export async function loadCompletedBattles(
  battleIds?: string[],
  now: Date = new Date()
): Promise<CompletedBattle[]> {
  const battles = await db.battle.findMany({
    // A battle that has ended is a superset of "completed"; computeBattleStatus makes the final call.
    // Regular battles only, in both branches: a duel id handed in explicitly (as `loadUserRecord`
    // and `countBattlesWon` do) is dropped too, so duels never reach any win or standing.
    where: battleIds ? { id: { in: battleIds }, ...regularBattleWhere } : { endDate: { lt: now }, ...regularBattleWhere },
    select: { id: true, startDate: true, endDate: true },
  })
  const completed = battles.filter((b) => computeBattleStatus(b.startDate, b.endDate, now) === 'COMPLETED')
  if (completed.length === 0) return []
  const ids = completed.map((b) => b.id)

  const [entries, counts] = await Promise.all([
    // Oldest entry first, id as the tiebreak. Runoff candidates keep this order, which must
    // never depend on votes (it would show who is ahead while the runoff is open).
    db.submission.findMany({
      where: { battleId: { in: ids } },
      select: { id: true, userId: true, battleId: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    db.vote.groupBy({ by: ['submissionId'], where: { battleId: { in: ids } }, _count: true }),
  ])
  const votesBySubmission = new Map(counts.map((c) => [c.submissionId, c._count]))

  const byBattle = new Map<string, OutcomeEntry[]>()
  for (const e of entries) {
    const list = byBattle.get(e.battleId) ?? []
    list.push({ id: e.id, userId: e.userId, votes: votesBySubmission.get(e.id) ?? 0 })
    byBattle.set(e.battleId, list)
  }

  // Only battles that tie for first can have a runoff, so only they need their tallies.
  const tiedBattleIds = completed.filter((b) => tiedForFirst(byBattle.get(b.id) ?? []).length > 0).map((b) => b.id)
  const runoffVotes = new Map<string, number>()
  if (tiedBattleIds.length > 0) {
    const tallies = await db.runoffVote.groupBy({
      by: ['submissionId'],
      where: { battleId: { in: tiedBattleIds } },
      _count: true,
    })
    for (const t of tallies) runoffVotes.set(t.submissionId, t._count)
  }

  return completed.map((b) => {
    const list = byBattle.get(b.id) ?? []
    return { id: b.id, endDate: b.endDate, entries: list, resolution: resolveBattle({ endDate: b.endDate, entries: list, runoffVotes, now }) }
  })
}

function forStandings(b: CompletedBattle): CompletedBattleEntries {
  return { id: b.id, endDate: b.endDate, entries: b.entries, places: b.resolution.places, pending: b.resolution.pending }
}

function byName(a: User, b: User): number {
  return (a.username ?? '').localeCompare(b.username ?? '') || a.id.localeCompare(b.id)
}

export interface BattleOutcome {
  winners: User[]
  /** The round-one vote total of the top entry (the tied top total on a tie). Null when nobody won or the runoff is open. */
  winningVotes: number | null
  /** The runoff, if the battle tied for first: candidates' votes are null while it is OPEN. Null when there was none. */
  runoff: BattleResolution['runoff']
}

/**
 * The outcome of each given battle: its winners as users, the winning vote total and the
 * runoff, if any. A few queries for all battles plus one user lookup. Every completed battle
 * gets an entry (empty when nobody won or a runoff is open); battles that are not completed
 * are left out. A shared win lists every winner.
 */
export async function loadOutcomesByBattle(battleIds: string[], now: Date = new Date()): Promise<Map<string, BattleOutcome>> {
  const battles = await loadCompletedBattles(battleIds, now)
  const winnerIds = new Map(battles.map((b) => [b.id, b.resolution.winnerUserIds]))
  const allIds = [...new Set([...winnerIds.values()].flatMap((s) => [...s]))]
  const users = allIds.length > 0 ? await db.user.findMany({ where: { id: { in: allIds } } }) : []
  const userById = new Map(users.map((u) => [u.id, u]))

  const result = new Map<string, BattleOutcome>()
  for (const battle of battles) {
    const ids = winnerIds.get(battle.id)!
    const winners = [...ids].map((id) => userById.get(id)).filter((u): u is User => !!u).sort(byName)
    const winningVotes = ids.size > 0 ? Math.max(...battle.entries.map((e) => e.votes)) : null
    result.set(battle.id, { winners, winningVotes, runoff: battle.resolution.runoff })
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
  const rows = rankChampions((await loadCompletedBattles(undefined, now)).map(forStandings))
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
      place: b.resolution.places.get(userId) ?? null,
      pending: b.resolution.pending,
    }))
  )
}
