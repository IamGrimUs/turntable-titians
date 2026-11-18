import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest'

vi.mock('./db', () => ({
  db: {
    battle: { findMany: vi.fn() },
    submission: { findMany: vi.fn(), findUnique: vi.fn() },
    vote: { groupBy: vi.fn() },
    runoffVote: { groupBy: vi.fn(), findUnique: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

import { ApolloServer } from '@apollo/server'
import { db } from './db'
import { typeDefs } from './schema'
import { resolvers } from './resolvers'
import type { Context } from './context'

const battleFindMany = db.battle.findMany as unknown as ReturnType<typeof vi.fn>
const submissionFindMany = db.submission.findMany as unknown as ReturnType<typeof vi.fn>
const submissionFindUnique = db.submission.findUnique as unknown as ReturnType<typeof vi.fn>
const voteGroupBy = db.vote.groupBy as unknown as ReturnType<typeof vi.fn>
const runoffGroupBy = db.runoffVote.groupBy as unknown as ReturnType<typeof vi.fn>
const runoffFindUnique = db.runoffVote.findUnique as unknown as ReturnType<typeof vi.fn>
const userFindMany = db.user.findMany as unknown as ReturnType<typeof vi.fn>

function daysFromToday(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

const battle = (id: string, startOffset: number, endOffset: number) => ({
  id,
  title: id,
  type: 'scratch',
  description: null,
  startDate: daysFromToday(startOffset),
  endDate: daysFromToday(endOffset),
  createdAt: new Date(),
  updatedAt: new Date(),
})
/** Ended long ago: any runoff window is over. */
const closed = (id: string) => battle(id, -30, -10)
/** Ended yesterday: the runoff opened today and is OPEN. */
const runoffOpen = (id: string) => battle(id, -30, -1)

const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes))
const entry = (id: string, userId: string, battleId: string, minutes: number) => ({
  id,
  userId,
  battleId,
  videoUrl: `https://example.com/${id}`,
  title: null,
  description: null,
  createdAt: at(minutes),
  updatedAt: at(minutes),
})

const server = new ApolloServer({ typeDefs, resolvers })
beforeAll(() => server.start())
afterAll(() => server.stop())
beforeEach(() => vi.resetAllMocks())

async function run(query: string, ctx: Context = { userId: null }) {
  const res = await server.executeOperation({ query }, { contextValue: ctx })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult
}

/**
 * One tied battle `t1`: s1 (ann), s2 (bob) and s3 (cy) tie on 2 round-one votes, s4 (dee) has 1.
 * Entry creation order is s2, s1, s3 (oldest first) so it differs from id order and vote order.
 * The entries query honours the orderBy it is given, like the real database.
 */
function mockTiedBattle(battles: unknown[], runoffTallies: Array<{ submissionId: string; _count: number }> = []) {
  battleFindMany.mockResolvedValue(battles)
  const all = [
    entry('s3', 'u3', 't1', 3),
    entry('s1', 'u1', 't1', 2),
    entry('s2', 'u2', 't1', 1),
    entry('s4', 'u4', 't1', 4),
  ]
  submissionFindMany.mockImplementation(async (args: { orderBy?: Array<Record<string, 'asc'>> | Record<string, 'asc'> }) => {
    const rows = [...all]
    const order = Array.isArray(args.orderBy) ? args.orderBy : args.orderBy ? [args.orderBy] : []
    rows.sort((a, b) => {
      for (const o of order) {
        const key = Object.keys(o)[0] as 'createdAt' | 'id'
        const av = key === 'createdAt' ? a.createdAt.getTime() : a.id
        const bv = key === 'createdAt' ? b.createdAt.getTime() : b.id
        if (av < bv) return -1
        if (av > bv) return 1
      }
      return 0
    })
    return rows
  })
  voteGroupBy.mockResolvedValue([
    { submissionId: 's1', _count: 2 },
    { submissionId: 's2', _count: 2 },
    { submissionId: 's3', _count: 2 },
    { submissionId: 's4', _count: 1 },
  ])
  runoffGroupBy.mockResolvedValue(runoffTallies)
  userFindMany.mockResolvedValue([])
  submissionFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    all.find((e) => e.id === where.id) ?? null,
  )
}

describe('Battle.runoff through real GraphQL execution', () => {
  it('stays one batched outcome read for a list of 3 normal battles and 1 tied battle', async () => {
    battleFindMany.mockResolvedValue([closed('n1'), closed('n2'), closed('n3'), runoffOpen('t1')])
    submissionFindMany.mockResolvedValue([
      entry('a1', 'u1', 'n1', 1),
      entry('a2', 'u2', 'n1', 2),
      entry('b1', 'u2', 'n2', 1),
      entry('c1', 'u1', 'n3', 1),
      entry('s1', 'u1', 't1', 1),
      entry('s2', 'u2', 't1', 2),
    ])
    voteGroupBy.mockResolvedValue([
      { submissionId: 'a1', _count: 3 },
      { submissionId: 'a2', _count: 1 },
      { submissionId: 'b1', _count: 2 },
      { submissionId: 's1', _count: 2 },
      { submissionId: 's2', _count: 2 },
    ])
    runoffGroupBy.mockResolvedValue([])
    userFindMany.mockResolvedValue([
      { id: 'u1', username: 'ann' },
      { id: 'u2', username: 'bob' },
    ])

    const result = await run('{ battles { id runoff { status } winners { id } } }')

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      battles: [
        { id: 'n1', runoff: null, winners: [{ id: 'u1' }] },
        { id: 'n2', runoff: null, winners: [{ id: 'u2' }] },
        { id: 'n3', runoff: null, winners: [] },
        { id: 't1', runoff: { status: 'OPEN' }, winners: [] },
      ],
    })
    // The list itself, plus ONE batched read for all four completed battles.
    expect(battleFindMany).toHaveBeenCalledTimes(2)
    expect(battleFindMany.mock.calls[1][0].where.id.in).toEqual(['n1', 'n2', 'n3', 't1'])
    expect(submissionFindMany).toHaveBeenCalledTimes(1)
    expect(voteGroupBy).toHaveBeenCalledTimes(1)
    expect(runoffGroupBy).toHaveBeenCalledTimes(1)
    expect(userFindMany).toHaveBeenCalledTimes(1)
    // No candidate submissions were asked for, so none were loaded.
    expect(submissionFindUnique).not.toHaveBeenCalled()
  })

  it('is null for a battle with no tie and for a battle that is not completed', async () => {
    battleFindMany.mockResolvedValue([closed('n1'), battle('act', -2, 2), battle('soon', 2, 5)])
    submissionFindMany.mockResolvedValue([entry('a1', 'u1', 'n1', 1), entry('a2', 'u2', 'n1', 2)])
    voteGroupBy.mockResolvedValue([{ submissionId: 'a1', _count: 3 }])
    userFindMany.mockResolvedValue([{ id: 'u1', username: 'ann' }])

    const result = await run('{ battles { id status runoff { status } } }')

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      battles: [
        { id: 'n1', status: 'COMPLETED', runoff: null },
        { id: 'act', status: 'ACTIVE', runoff: null },
        { id: 'soon', status: 'UPCOMING', runoff: null },
      ],
    })
    // Only the completed battle was ever read.
    expect(battleFindMany.mock.calls[1][0].where.id.in).toEqual(['n1'])
  })

  it('exposes the window as ISO strings from the end date', async () => {
    mockTiedBattle([runoffOpen('t1')])
    const result = await run('{ battles { id endDate runoff { opensAt endsAt } } }')

    expect(result.errors).toBeUndefined()
    const b = (result.data as { battles: Array<{ runoff: { opensAt: string; endsAt: string } }> }).battles[0]
    const end = runoffOpen('t1').endDate
    const opens = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)
    const ends = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 3)
    expect(b.runoff.opensAt).toBe(opens.toISOString())
    expect(b.runoff.endsAt).toBe(ends.toISOString())
  })

  it('hides every runoff count while OPEN, even when runoff votes exist', async () => {
    mockTiedBattle([runoffOpen('t1')], [
      { submissionId: 's1', _count: 7 },
      { submissionId: 's2', _count: 1 },
    ])

    const result = await run('{ battles { runoff { status candidates { votes submission { id } } } } }')

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      battles: [
        {
          runoff: {
            status: 'OPEN',
            candidates: [
              { votes: null, submission: { id: 's2' } },
              { votes: null, submission: { id: 's1' } },
              { votes: null, submission: { id: 's3' } },
            ],
          },
        },
      ],
    })
    expect(JSON.stringify(result.data)).not.toContain('7')
  })

  it('shows numbers and DECIDED once the window has closed', async () => {
    mockTiedBattle([closed('t1')], [
      { submissionId: 's1', _count: 5 },
      { submissionId: 's2', _count: 2 },
    ])

    const result = await run('{ battles { winners { id } runoff { status candidates { votes submission { id } } } } }')

    expect(result.errors).toBeUndefined()
    const [b] = (result.data as { battles: Array<{ runoff: unknown }> }).battles
    expect(b.runoff).toEqual({
      status: 'DECIDED',
      candidates: [
        { votes: 2, submission: { id: 's2' } },
        { votes: 5, submission: { id: 's1' } },
        { votes: 0, submission: { id: 's3' } },
      ],
    })
  })

  it('reports TIED when the closed runoff is level at the top', async () => {
    mockTiedBattle([closed('t1')], [
      { submissionId: 's1', _count: 4 },
      { submissionId: 's2', _count: 4 },
    ])

    const result = await run('{ battles { runoff { status candidates { votes } } } }')

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      battles: [{ runoff: { status: 'TIED', candidates: [{ votes: 4 }, { votes: 4 }, { votes: 0 }] } }],
    })
  })

  it('orders candidates by entry creation time, never by votes', async () => {
    // s1 leads on runoff votes but is not the oldest entry; the order must not move.
    mockTiedBattle([closed('t1')], [
      { submissionId: 's1', _count: 9 },
      { submissionId: 's3', _count: 4 },
    ])

    const result = await run('{ battles { runoff { candidates { submission { id } } } } }')

    expect(result.errors).toBeUndefined()
    const ids = (result.data as { battles: Array<{ runoff: { candidates: Array<{ submission: { id: string } }> } }> })
      .battles[0].runoff.candidates.map((c) => c.submission.id)
    expect(ids).toEqual(['s2', 's1', 's3']) // created at minute 1, 2, 3
    // The entries query itself asks for the deterministic order.
    expect(submissionFindMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }])
  })

  describe('viewerVoteSubmissionId', () => {
    it('is null for anonymous callers and makes no runoffVote query', async () => {
      mockTiedBattle([runoffOpen('t1')])

      const result = await run('{ battles { runoff { viewerVoteSubmissionId } } }')

      expect(result.errors).toBeUndefined()
      expect(result.data).toEqual({ battles: [{ runoff: { viewerVoteSubmissionId: null } }] })
      expect(runoffFindUnique).not.toHaveBeenCalled()
    })

    it('does not query at all unless asked for', async () => {
      mockTiedBattle([runoffOpen('t1')])
      await run('{ battles { runoff { status } } }', { userId: 'u9' })
      expect(runoffFindUnique).not.toHaveBeenCalled()
    })

    it('returns only the caller\'s own choice, looked up by the caller\'s id', async () => {
      mockTiedBattle([runoffOpen('t1')])
      runoffFindUnique.mockResolvedValue({ submissionId: 's2' })

      const result = await run('{ battles { runoff { viewerVoteSubmissionId } } }', { userId: 'u9' })

      expect(result.errors).toBeUndefined()
      expect(result.data).toEqual({ battles: [{ runoff: { viewerVoteSubmissionId: 's2' } }] })
      expect(runoffFindUnique).toHaveBeenCalledTimes(1)
      expect(runoffFindUnique.mock.calls[0][0].where).toEqual({ userId_battleId: { userId: 'u9', battleId: 't1' } })
    })

    it('is null when the caller has not voted', async () => {
      mockTiedBattle([runoffOpen('t1')])
      runoffFindUnique.mockResolvedValue(null)

      const result = await run('{ battles { runoff { viewerVoteSubmissionId } } }', { userId: 'u9' })

      expect(result.data).toEqual({ battles: [{ runoff: { viewerVoteSubmissionId: null } }] })
    })
  })

  describe('viewerCanVote', () => {
    const canVote = async (ctx: Context, battles: unknown[] = [runoffOpen('t1')]) => {
      mockTiedBattle(battles)
      const result = await run('{ battles { runoff { viewerCanVote } } }', ctx)
      expect(result.errors).toBeUndefined()
      return (result.data as { battles: Array<{ runoff: { viewerCanVote: boolean } }> }).battles[0].runoff.viewerCanVote
    }

    it('is true for an eligible signed-in voter while the runoff is open', async () => {
      expect(await canVote({ userId: 'u9' })).toBe(true)
    })

    it('is true for someone with an entry that is not in the runoff', async () => {
      expect(await canVote({ userId: 'u4' })).toBe(true)
    })

    it('is false for anonymous callers', async () => {
      expect(await canVote({ userId: null })).toBe(false)
    })

    it('is false for a suspended caller', async () => {
      expect(await canVote({ userId: 'u9', suspension: { reason: 'spam', until: null } })).toBe(false)
    })

    it('is false for the owner of a candidate entry', async () => {
      expect(await canVote({ userId: 'u1' })).toBe(false)
      expect(await canVote({ userId: 'u3' })).toBe(false)
    })

    it('is false after the window closed', async () => {
      expect(await canVote({ userId: 'u9' }, [closed('t1')])).toBe(false)
    })

    it('makes no query of its own', async () => {
      await canVote({ userId: 'u9' })
      expect(runoffFindUnique).not.toHaveBeenCalled()
    })
  })
})
