import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    battle: { findMany: vi.fn() },
    submission: { findMany: vi.fn() },
    vote: { groupBy: vi.fn() },
    runoffVote: { groupBy: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

import { db } from './db'
import { countBattlesWon } from './userBattlesWon'
import { loadOutcomesByBattle, loadHallOfFame, loadUserRecord } from './standings'
import { buildAdminUserRows, type StatsInput } from './adminUserStats'

/**
 * Every consumer of "who won" must agree. One fixture, five battles, every consumer.
 * Users: a, b, c, d.
 *
 *   b1  no tie                     a 5, b 2            a wins
 *   b2  tie, runoff decided        a 3, b 3  runoff a 1, b 4   b wins
 *   b3  tie, runoff level          a 3, b 3  runoff none       a and b share
 *   b4  tie, runoff still OPEN     a 2, b 2                    pending: nobody counts
 *   b5  tie for second only        c 6, a 2, d 2               c wins
 */
const NOW = new Date(2026, 5, 10, 12) // 10 June 2026, local
const battle = (id: string, endMonth: number, endDay: number) => ({
  id,
  startDate: new Date(2026, 0, 1),
  endDate: new Date(2026, endMonth - 1, endDay, 12),
})
const battles = [
  battle('b1', 2, 1),
  battle('b2', 3, 1),
  battle('b3', 4, 1),
  battle('b4', 6, 9), // ended yesterday: runoff open
  battle('b5', 5, 1),
]
const submissions = [
  { id: 's1a', userId: 'a', battleId: 'b1' },
  { id: 's1b', userId: 'b', battleId: 'b1' },
  { id: 's2a', userId: 'a', battleId: 'b2' },
  { id: 's2b', userId: 'b', battleId: 'b2' },
  { id: 's3a', userId: 'a', battleId: 'b3' },
  { id: 's3b', userId: 'b', battleId: 'b3' },
  { id: 's4a', userId: 'a', battleId: 'b4' },
  { id: 's4b', userId: 'b', battleId: 'b4' },
  { id: 's5c', userId: 'c', battleId: 'b5' },
  { id: 's5a', userId: 'a', battleId: 'b5' },
  { id: 's5d', userId: 'd', battleId: 'b5' },
]
const voteCounts = new Map([
  ['s1a', 5], ['s1b', 2],
  ['s2a', 3], ['s2b', 3],
  ['s3a', 3], ['s3b', 3],
  ['s4a', 2], ['s4b', 2],
  ['s5c', 6], ['s5a', 2], ['s5d', 2],
])
const runoffCounts = new Map([['s2a', 1], ['s2b', 4]])
const users = ['a', 'b', 'c', 'd'].map((id) => ({ id, username: id }))
// Expected wins: a = b1 + b3 = 2, b = b2 + b3 = 2, c = b5 = 1, d = 0. b4 (OPEN) counts for no one.
const EXPECTED: Record<string, number> = { a: 2, b: 2, c: 1, d: 0 }

const battleFindMany = db.battle.findMany as unknown as ReturnType<typeof vi.fn>
const submissionFindMany = db.submission.findMany as unknown as ReturnType<typeof vi.fn>
const voteGroupBy = db.vote.groupBy as unknown as ReturnType<typeof vi.fn>
const runoffGroupBy = db.runoffVote.groupBy as unknown as ReturnType<typeof vi.fn>
const userFindMany = db.user.findMany as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
  battleFindMany.mockImplementation(async (args: { where: { id?: { in: string[] } } }) => {
    const ids = args.where.id?.in
    return ids ? battles.filter((b) => ids.includes(b.id)) : battles
  })
  submissionFindMany.mockImplementation(async (args: { where: { userId?: string; battleId?: { in: string[] } } }) => {
    if (args.where.userId) {
      return submissions.filter((s) => s.userId === args.where.userId).map((s) => ({ battleId: s.battleId }))
    }
    const ids = args.where.battleId?.in
    return ids ? submissions.filter((s) => ids.includes(s.battleId)) : submissions
  })
  voteGroupBy.mockImplementation(async () => [...voteCounts].map(([submissionId, _count]) => ({ submissionId, _count })))
  runoffGroupBy.mockImplementation(async () => [...runoffCounts].map(([submissionId, _count]) => ({ submissionId, _count })))
  userFindMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
    users.filter((u) => args.where.id.in.includes(u.id))
  )
})

function statsInput(): StatsInput {
  return {
    users: users.map((u) => ({
      id: u.id, username: u.username, name: null, image: null, email: `${u.id}@example.com`, role: 'USER' as const,
      externalCrews: [], internalCrewNames: [], createdAt: new Date(2026, 0, 1), lastSignInAt: new Date(2026, 0, 1),
      suspendedAt: null, suspendedUntil: null, suspensionReason: null,
    })),
    submissions,
    voteCountsBySubmission: voteCounts,
    votesCastByUser: new Map(),
    ideasPostedByUser: new Map(),
    runoffVotesBySubmission: runoffCounts,
    battles,
  }
}

describe('every consumer agrees on who won', () => {
  it('countBattlesWon', async () => {
    for (const [userId, wins] of Object.entries(EXPECTED)) {
      expect(await countBattlesWon(userId, NOW), userId).toBe(wins)
    }
  })

  it('loadOutcomesByBattle', async () => {
    const outcomes = await loadOutcomesByBattle(battles.map((b) => b.id), NOW)
    const wins: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 }
    for (const o of outcomes.values()) for (const u of o.winners) wins[u.id]++
    expect(wins).toEqual(EXPECTED)
    expect(outcomes.get('b4')!.winners).toEqual([])
    expect(outcomes.get('b4')!.runoff?.status).toBe('OPEN')
  })

  it('loadHallOfFame', async () => {
    const rows = await loadHallOfFame(NOW)
    const wins = Object.fromEntries(rows.map((r) => [r.user.id, r.wins]))
    expect(wins).toEqual({ a: 2, b: 2, c: 1 }) // d has no win, so is not in the Hall of Fame
    // b4 is in an open runoff: not counted as entered for a or b (4 completed battles, not 5 for a).
    expect(Object.fromEntries(rows.map((r) => [r.user.id, r.battlesEntered]))).toEqual({ a: 4, b: 3, c: 1 })
  })

  it('loadUserRecord', async () => {
    for (const [userId, wins] of Object.entries(EXPECTED)) {
      expect((await loadUserRecord(userId, NOW)).wins, userId).toBe(wins)
    }
    expect((await loadUserRecord('a', NOW)).battlesEntered).toBe(4)
    expect((await loadUserRecord('b', NOW)).battlesEntered).toBe(3)
  })

  it('buildAdminUserRows', () => {
    const rows = buildAdminUserRows(statsInput(), NOW)
    expect(Object.fromEntries(rows.map((r) => [r.id, r.battlesWon]))).toEqual(EXPECTED)
    // The admin entries column is round-one only and still counts the open-runoff battle.
    expect(rows.find((r) => r.id === 'a')!.entries).toBe(5)
    expect(rows.find((r) => r.id === 'a')!.votesReceived).toBe(5 + 3 + 3 + 2 + 2)
  })

  it('makes no runoff query when nothing ties for first', async () => {
    voteGroupBy.mockImplementation(async () => [
      { submissionId: 's1a', _count: 5 }, { submissionId: 's1b', _count: 2 },
      { submissionId: 's5c', _count: 6 }, { submissionId: 's5a', _count: 2 }, { submissionId: 's5d', _count: 2 },
    ])
    await loadOutcomesByBattle(['b1', 'b5'], NOW)
    await loadHallOfFame(NOW)
    expect(runoffGroupBy).toHaveBeenCalledTimes(0)
  })
})
