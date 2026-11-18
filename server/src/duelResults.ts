import type { Battle } from '@prisma/client'
import { computeBattleStatus } from './battleStatus'
import { createBatcher } from './batcher'
import { duelOutcome, type DuelOutcome } from './challengeRules'
import type { Context } from './context'
import { db } from './db'

/**
 * The read side of head to head duels. A duel is a Battle with an ACCEPTED Challenge linked to
 * it; the client never decides an outcome, it shows what is computed here. Votes and outcome
 * stay secret (null) until the battle is COMPLETED, exactly like `Submission.voteCount`, and
 * vote counts are not even queried for a duel that is still open. Duels never feed
 * `resolveBattle`, wins or standings: this file is the only place their result is computed.
 */

export interface DuelInfo {
  battleId: string
  challengerId: string
  opponentId: string
  challengerVotes: number | null
  opponentVotes: number | null
  outcome: DuelOutcome | null
}

type HeadToHeadResultKind = 'WON' | 'LOST' | 'DRAW'

export interface HeadToHeadResultRow {
  battleId: string
  opponentId: string
  result: HeadToHeadResultKind
  endedAt: Date
}

export interface HeadToHeadSummary {
  wins: number
  losses: number
  draws: number
  results: HeadToHeadResultRow[]
}

/** Wins, losses and draws from one user's side of finished duels, newest first. Pure. */
export function summarizeHeadToHead(
  userId: string,
  duels: Array<{ battleId: string; endDate: Date; challengerId: string; opponentId: string; outcome: DuelOutcome }>,
): HeadToHeadSummary {
  const summary: HeadToHeadSummary = { wins: 0, losses: 0, draws: 0, results: [] }
  for (const d of duels) {
    const asChallenger = d.challengerId === userId
    if (!asChallenger && d.opponentId !== userId) continue
    let result: HeadToHeadResultKind
    if (d.outcome === 'DRAW') result = 'DRAW'
    else result = (d.outcome === 'CHALLENGER_WON') === asChallenger ? 'WON' : 'LOST'
    if (result === 'WON') summary.wins++
    else if (result === 'LOST') summary.losses++
    else summary.draws++
    summary.results.push({
      battleId: d.battleId,
      opponentId: asChallenger ? d.opponentId : d.challengerId,
      result,
      endedAt: d.endDate,
    })
  }
  // Newest first; duels that ended at the same time fall back to the battle id so the order never
  // depends on what order the database happened to return the rows in.
  summary.results.sort(
    (a, b) => b.endedAt.getTime() - a.endedAt.getTime() || (a.battleId < b.battleId ? -1 : a.battleId > b.battleId ? 1 : 0),
  )
  return summary
}

const DUEL_SELECT = {
  battleId: true,
  challengerId: true,
  opponentId: true,
  battle: {
    select: {
      id: true,
      startDate: true,
      endDate: true,
      submissions: { select: { id: true, userId: true } },
    },
  },
} as const

type DuelRow = {
  battleId: string | null
  challengerId: string
  opponentId: string
  battle: { id: string; startDate: Date; endDate: Date; submissions: Array<{ id: string; userId: string }> } | null
}

interface ResolvedDuel extends DuelInfo {
  endDate: Date
}

/**
 * Turns challenge rows into duels. Vote counts are read once, for the COMPLETED ones only
 * (none at all while every duel is still open).
 */
async function resolveDuels(rows: DuelRow[], now: Date): Promise<ResolvedDuel[]> {
  const duels = rows.filter((r): r is DuelRow & { battleId: string; battle: NonNullable<DuelRow['battle']> } => !!r.battleId && !!r.battle)
  const completed = duels.filter((r) => computeBattleStatus(r.battle.startDate, r.battle.endDate, now) === 'COMPLETED')

  const votesBySubmission = new Map<string, number>()
  if (completed.length > 0) {
    const tallies = await db.vote.groupBy({
      by: ['submissionId'],
      where: { battleId: { in: completed.map((r) => r.battleId) } },
      _count: true,
    })
    for (const t of tallies) votesBySubmission.set(t.submissionId, t._count)
  }
  const completedIds = new Set(completed.map((r) => r.battleId))

  return duels.map((r) => {
    const base = { battleId: r.battleId, challengerId: r.challengerId, opponentId: r.opponentId, endDate: r.battle.endDate }
    if (!completedIds.has(r.battleId)) return { ...base, challengerVotes: null, opponentVotes: null, outcome: null }
    const votesOf = (userId: string) =>
      r.battle.submissions.filter((s) => s.userId === userId).reduce((sum, s) => sum + (votesBySubmission.get(s.id) ?? 0), 0)
    const challengerVotes = votesOf(r.challengerId)
    const opponentVotes = votesOf(r.opponentId)
    return { ...base, challengerVotes, opponentVotes, outcome: duelOutcome(challengerVotes, opponentVotes) }
  })
}

/**
 * The duel behind each given battle id; a battle that is not a duel is absent from the map.
 * One challenge query plus one vote query for all of them (none for open duels).
 */
export async function loadDuels(battleIds: string[], now: Date = new Date()): Promise<Map<string, DuelInfo>> {
  const map = new Map<string, DuelInfo>()
  if (battleIds.length === 0) return map
  const rows = await db.challenge.findMany({
    where: { battleId: { in: battleIds }, status: 'ACCEPTED' },
    select: DUEL_SELECT,
  })
  for (const { endDate: _endDate, ...duel } of await resolveDuels(rows, now)) map.set(duel.battleId, duel)
  return map
}

/** One user's head to head record: COMPLETED duels only, newest first. Known limit: reads all of the user's duels. */
export async function loadHeadToHead(userId: string, now: Date = new Date()): Promise<HeadToHeadSummary> {
  const rows = await db.challenge.findMany({
    where: {
      status: 'ACCEPTED',
      battleId: { not: null },
      OR: [{ challengerId: userId }, { opponentId: userId }],
    },
    orderBy: [{ battle: { endDate: 'desc' } }, { battleId: 'asc' }],
    select: DUEL_SELECT,
  })
  const finished = (await resolveDuels(rows, now)).filter(
    (d): d is ResolvedDuel & { outcome: DuelOutcome } => d.outcome !== null,
  )
  return summarizeHeadToHead(userId, finished)
}

type DuelFor = (battleId: string) => Promise<DuelInfo | undefined>

// One batcher per request (the context object lives exactly as long as the request), so a
// list of battles loads all its duels together instead of one query set per battle.
const loaders = new WeakMap<object, DuelFor>()

function duelLoader(ctx: Context | undefined): DuelFor {
  const make = (): DuelFor => createBatcher<DuelInfo>((ids) => loadDuels(ids))
  if (!ctx) return make()
  let loader = loaders.get(ctx)
  if (!loader) {
    loader = make()
    loaders.set(ctx, loader)
  }
  return loader
}

/** `Battle.duel`: null for a regular battle. Outcome and votes are null until COMPLETED. */
export async function duelBattleField(parent: Battle, _args: unknown, ctx?: Context): Promise<DuelInfo | null> {
  return (await duelLoader(ctx)(parent.id)) ?? null
}

const userById = (id: string) => db.user.findUnique({ where: { id } })

/** The `Duel` fields. `User` never carries an email over GraphQL. */
export const duelFields = {
  challenger: (parent: DuelInfo) => userById(parent.challengerId),
  opponent: (parent: DuelInfo) => userById(parent.opponentId),
  /** The winning DJ; null on a draw and until the duel is over (no query then). */
  winner: async (parent: DuelInfo) => {
    if (parent.outcome === 'CHALLENGER_WON') return userById(parent.challengerId)
    if (parent.outcome === 'OPPONENT_WON') return userById(parent.opponentId)
    return null
  },
}

/** `User.headToHead`: only runs when a client asks for it. */
export const userHeadToHead = (parent: { id: string }) => loadHeadToHead(parent.id)

export const RESULTS_DEFAULT = 5
export const RESULTS_MAX = 20

export const headToHeadRecordFields = {
  /** Newest first; `limit` is clamped to 1-20 (default 5). */
  results: (parent: HeadToHeadSummary, args: { limit?: number | null }): HeadToHeadResultRow[] => {
    const limit = Math.min(Math.max(args.limit ?? RESULTS_DEFAULT, 1), RESULTS_MAX)
    return parent.results.slice(0, limit)
  },
}

export const headToHeadResultFields = {
  opponent: (parent: HeadToHeadResultRow) => userById(parent.opponentId),
  endedAt: (parent: HeadToHeadResultRow) => parent.endedAt.toISOString(),
}
