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
import { regularBattleWhere } from './battleKind'

/**
 * Every consumer of "who won" must agree. One fixture, five regular battles plus one head to
 * head duel, every consumer.
 * Users: a, b, c, d.
 *
 *   b1  no tie                     a 5, b 2            a wins
 *   b2  tie, runoff decided        a 3, b 3  runoff a 1, b 4   b wins
 *   b3  tie, runoff level          a 3, b 3  runoff none       a and b share
 *   b4  tie, runoff still OPEN     a 2, b 2                    pending: nobody counts
 *   b5  tie for second only        c 6, a 2, d 2               c wins
 *   duel  a Challenge battle       a 5, c 3                    a would win if it counted: it never does
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
// A completed head to head duel (it has a Challenge row). The database drops it for regularBattleWhere.
const duelBattle = battle('duel', 3, 15)
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
  { id: 'sda', userId: 'a', battleId: 'duel' },
  { id: 'sdc', userId: 'c', battleId: 'duel' },
]
const voteCounts = new Map([
  ['s1a', 5], ['s1b', 2],
  ['s2a', 3], ['s2b', 3],
  ['s3a', 3], ['s3b', 3],
  ['s4a', 2], ['s4b', 2],
  ['s5c', 6], ['s5a', 2], ['s5d', 2],
  ['sda', 5], ['sdc', 3],
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
  battleFindMany.mockImplementation(async (args: { where: { id?: { in: string[] }; challenge?: unknown } }) => {
    // Honour the duel filter the way Prisma does: only when it is asked for.
    const pool = JSON.stringify(args.where.challenge) === JSON.stringify(regularBattleWhere.challenge)
      ? battles
      : [...battles, duelBattle]
    const ids = args.where.id?.in
    return ids ? pool.filter((b) => ids.includes(b.id)) : pool
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
    battles, // the admin loader reads regular battles only, so the duel is not in this list
  }
}

describe('every consumer agrees on who won', () => {
  it('countBattlesWon', async () => {
    for (const [userId, wins] of Object.entries(EXPECTED)) {
      expect(await countBattlesWon(userId, NOW), userId).toBe(wins)
    }
  })

  it('loadOutcomesByBattle', async () => {
    const outcomes = await loadOutcomesByBattle([...battles, duelBattle].map((b) => b.id), NOW)
    const wins: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 }
    for (const o of outcomes.values()) for (const u of o.winners) wins[u.id]++
    expect(wins).toEqual(EXPECTED)
    expect(outcomes.has('duel')).toBe(false)
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
    // Duel entries and votes are real activity: they still count in entries and votes received.
    expect(rows.find((r) => r.id === 'a')!.entries).toBe(6)
    expect(rows.find((r) => r.id === 'a')!.votesReceived).toBe(5 + 3 + 3 + 2 + 2 + 5)
  })

  it('a completed duel (a 5, c 3) appears in none of the consumers, while the regular battles still do', async () => {
    // Winners: the duel has no outcome at all, and a is not among b1..b5 winners for it.
    const outcomes = await loadOutcomesByBattle(['duel', 'b1'], NOW)
    expect([...outcomes.keys()]).toEqual(['b1'])
    expect(outcomes.get('b1')!.winners.map((u) => u.id)).toEqual(['a'])
    // Hall of Fame: c has one regular win (b5) and one regular battle, not two; a entered 4 regular battles.
    const hof = await loadHallOfFame(NOW)
    expect(hof.find((r) => r.user.id === 'c')).toMatchObject({ wins: 1, battlesEntered: 1 })
    expect(hof.find((r) => r.user.id === 'a')).toMatchObject({ wins: 2, battlesEntered: 4 })
    // User record and countBattlesWon: the duel is neither a win nor an entry.
    expect(await loadUserRecord('a', NOW)).toMatchObject({ wins: 2, battlesEntered: 4 })
    expect(await loadUserRecord('c', NOW)).toMatchObject({ wins: 1, battlesEntered: 1 })
    expect(await countBattlesWon('a', NOW)).toBe(2)
    expect(await countBattlesWon('c', NOW)).toBe(1)
    // Admin battles won: not counted (the duel is not in the battles list), entries still are.
    const rows = buildAdminUserRows(statsInput(), NOW)
    expect(rows.find((r) => r.id === 'a')!.battlesWon).toBe(2)
    expect(rows.find((r) => r.id === 'c')!.battlesWon).toBe(1)
    expect(rows.find((r) => r.id === 'c')!.entries).toBe(2)
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
