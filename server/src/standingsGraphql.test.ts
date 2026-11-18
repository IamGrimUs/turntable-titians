import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest'

vi.mock('./db', () => ({
  db: {
    battle: { findMany: vi.fn() },
    submission: { findMany: vi.fn() },
    vote: { groupBy: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

import { ApolloServer } from '@apollo/server'
import { db } from './db'
import { typeDefs } from './schema'
import { resolvers } from './resolvers'

const battleFindMany = db.battle.findMany as unknown as ReturnType<typeof vi.fn>
const submissionFindMany = db.submission.findMany as unknown as ReturnType<typeof vi.fn>
const voteGroupBy = db.vote.groupBy as unknown as ReturnType<typeof vi.fn>
const userFindMany = db.user.findMany as unknown as ReturnType<typeof vi.fn>

const day = 24 * 3600 * 1000
const battle = (id: string, offsetStart: number, offsetEnd: number) => ({
  id,
  title: id,
  type: 'scratch',
  description: null,
  startDate: new Date(Date.now() + offsetStart * day),
  endDate: new Date(Date.now() + offsetEnd * day),
  createdAt: new Date(),
  updatedAt: new Date(),
})
const done = (id: string) => battle(id, -30, -10)

const server = new ApolloServer({ typeDefs, resolvers })
beforeAll(() => server.start())
afterAll(() => server.stop())
beforeEach(() => vi.resetAllMocks())

async function run(query: string) {
  const res = await server.executeOperation({ query }, { contextValue: { userId: null } })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult
}

describe('Battle.winners through real GraphQL execution', () => {
  it('loads the winners of a whole battles list with one batch, not one per battle', async () => {
    battleFindMany.mockResolvedValue([done('b1'), done('b2'), done('b3'), battle('b4', -2, 2)])
    submissionFindMany.mockResolvedValue([
      { id: 's1', userId: 'u1', battleId: 'b1' },
      { id: 's2', userId: 'u2', battleId: 'b1' },
      { id: 's3', userId: 'u2', battleId: 'b2' },
      { id: 's4', userId: 'u1', battleId: 'b3' },
    ])
    voteGroupBy.mockResolvedValue([
      { submissionId: 's1', _count: 3 },
      { submissionId: 's2', _count: 1 },
      { submissionId: 's3', _count: 2 },
    ])
    userFindMany.mockResolvedValue([
      { id: 'u1', username: 'ann' },
      { id: 'u2', username: 'bob' },
    ])

    const result = await run('{ battles { id status winningVotes winners { id username } } }')

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      battles: [
        { id: 'b1', status: 'COMPLETED', winningVotes: 3, winners: [{ id: 'u1', username: 'ann' }] },
        { id: 'b2', status: 'COMPLETED', winningVotes: 2, winners: [{ id: 'u2', username: 'bob' }] },
        { id: 'b3', status: 'COMPLETED', winningVotes: null, winners: [] }, // no votes: nobody won
        { id: 'b4', status: 'ACTIVE', winningVotes: null, winners: [] }, // open: nothing revealed
      ],
    })
    // The list itself, plus ONE batched read for all three completed battles.
    expect(battleFindMany).toHaveBeenCalledTimes(2)
    expect(submissionFindMany).toHaveBeenCalledTimes(1)
    expect(voteGroupBy).toHaveBeenCalledTimes(1)
    expect(userFindMany).toHaveBeenCalledTimes(1)
    // The open battle was never asked about, so its votes were never read.
    expect(battleFindMany.mock.calls[1][0].where.id.in).toEqual(['b1', 'b2', 'b3'])
  })

  it('serves the Hall of Fame and returns champions in rank order', async () => {
    battleFindMany.mockResolvedValue([done('b1'), done('b2')])
    submissionFindMany.mockResolvedValue([
      { id: 's1', userId: 'u1', battleId: 'b1' },
      { id: 's2', userId: 'u2', battleId: 'b1' },
      { id: 's3', userId: 'u1', battleId: 'b2' },
      { id: 's4', userId: 'u2', battleId: 'b2' },
    ])
    voteGroupBy.mockResolvedValue([
      { submissionId: 's1', _count: 5 },
      { submissionId: 's2', _count: 1 },
      { submissionId: 's3', _count: 5 },
      { submissionId: 's4', _count: 1 },
    ])
    userFindMany.mockResolvedValue([
      { id: 'u1', username: 'ann' },
      { id: 'u2', username: 'bob' },
    ])

    const result = await run('{ hallOfFame { rank wins battlesEntered user { id username } } }')

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      hallOfFame: [{ rank: 1, wins: 2, battlesEntered: 2, user: { id: 'u1', username: 'ann' } }],
    })
  })

  it('serves User.record, and the record agrees with battlesWon', async () => {
    // user(id) reads the user, then record and battlesWon each read that user's entries.
    ;(db.user as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi.fn().mockResolvedValue({
      id: 'u1', username: 'ann', name: null, image: null, externalCrews: [], createdAt: new Date(),
    })
    submissionFindMany.mockImplementation(async (args: { where: { userId?: string; battleId?: unknown } }) =>
      args.where.userId
        ? [{ battleId: 'b1' }, { battleId: 'b2' }]
        : [
            { id: 's1', userId: 'u1', battleId: 'b1' },
            { id: 's2', userId: 'u2', battleId: 'b1' },
            { id: 's3', userId: 'u1', battleId: 'b2' },
            { id: 's4', userId: 'u2', battleId: 'b2' },
          ],
    )
    battleFindMany.mockResolvedValue([done('b1'), done('b2')])
    voteGroupBy.mockResolvedValue([
      { submissionId: 's1', _count: 4 },
      { submissionId: 's2', _count: 1 },
      { submissionId: 's3', _count: 1 },
      { submissionId: 's4', _count: 2 },
    ])

    const result = await run(
      '{ user(id: "u1") { battlesWon record { wins podiums bestFinish currentStreak bestStreak battlesEntered } } }',
    )

    expect(result.errors).toBeUndefined()
    const user = (result.data as { user: { battlesWon: number; record: { wins: number } } }).user
    expect(user.record).toMatchObject({ wins: 1, podiums: 2, bestFinish: 1, battlesEntered: 2 })
    expect(user.record.wins).toBe(user.battlesWon)
  })
})
