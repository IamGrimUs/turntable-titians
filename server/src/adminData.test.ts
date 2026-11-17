import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    user: { findMany: vi.fn() },
    submission: { findMany: vi.fn() },
    vote: { groupBy: vi.fn() },
    battle: { findMany: vi.fn() },
    // Deliberately no ideaVote or ideaCommentVote: touching them would throw.
    idea: { groupBy: vi.fn() },
  },
}))

import { db } from './db'
import { loadAdminUserRows } from './adminData'

const userFindMany = db.user.findMany as unknown as ReturnType<typeof vi.fn>
const submissionFindMany = db.submission.findMany as unknown as ReturnType<typeof vi.fn>
const voteGroupBy = db.vote.groupBy as unknown as ReturnType<typeof vi.fn>
const battleFindMany = db.battle.findMany as unknown as ReturnType<typeof vi.fn>
const ideaGroupBy = db.idea.groupBy as unknown as ReturnType<typeof vi.fn>

const day = 24 * 3600 * 1000
const dbUser = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  username: id,
  name: null,
  image: null,
  email: `${id}@example.com`,
  role: 'USER',
  externalCrews: [],
  internalCrews: [],
  createdAt: new Date('2026-01-01'),
  lastSignInAt: new Date('2026-02-01'),
  suspendedAt: null,
  suspendedUntil: null,
  suspensionReason: null,
  ...extra,
})

beforeEach(() => {
  userFindMany.mockReset().mockResolvedValue([])
  submissionFindMany.mockReset().mockResolvedValue([])
  voteGroupBy.mockReset().mockResolvedValue([])
  battleFindMany.mockReset().mockResolvedValue([])
  ideaGroupBy.mockReset().mockResolvedValue([])
})

describe('loadAdminUserRows', () => {
  it('passes where { id: { in } } to user.findMany when ids are given', async () => {
    await loadAdminUserRows(['a'])
    expect(userFindMany).toHaveBeenCalledTimes(1)
    expect(userFindMany.mock.calls[0][0].where).toEqual({ id: { in: ['a'] } })
  })

  it('passes no where clause when called without ids', async () => {
    await loadAdminUserRows()
    expect(userFindMany).toHaveBeenCalledTimes(1)
    expect(userFindMany.mock.calls[0][0]).not.toHaveProperty('where')
  })

  it('includes the internal crew names on the user query', async () => {
    await loadAdminUserRows()
    expect(userFindMany.mock.calls[0][0].include).toEqual({
      internalCrews: { select: { crew: { select: { name: true } } } },
    })
  })

  it('reads the full submission, vote-count and battle data in one query each', async () => {
    await loadAdminUserRows(['a'])
    expect(submissionFindMany).toHaveBeenCalledTimes(1)
    expect(submissionFindMany.mock.calls[0][0].where).toBeUndefined()
    expect(battleFindMany).toHaveBeenCalledTimes(1)
    expect(battleFindMany.mock.calls[0][0]?.where).toBeUndefined()
    expect(voteGroupBy).toHaveBeenCalledTimes(2)
    expect(voteGroupBy).toHaveBeenCalledWith({ by: ['submissionId'], _count: true })
    expect(voteGroupBy).toHaveBeenCalledWith({ by: ['userId'], _count: true })
  })

  it('counts ideas with one groupBy on the idea table and leaves the battle vote queries alone', async () => {
    ideaGroupBy.mockResolvedValue([{ authorId: 'a', _count: 4 }])
    userFindMany.mockResolvedValue([dbUser('a'), dbUser('b')])
    const rows = await loadAdminUserRows()
    expect(ideaGroupBy).toHaveBeenCalledTimes(1)
    expect(ideaGroupBy).toHaveBeenCalledWith({ by: ['authorId'], _count: true })
    expect(voteGroupBy).toHaveBeenCalledTimes(2)
    expect(rows.find((r) => r.id === 'a')?.ideasPosted).toBe(4)
    expect(rows.find((r) => r.id === 'b')?.ideasPosted).toBe(0)
    expect(rows.every((r) => r.votesCast === 0 && r.votesReceived === 0)).toBe(true)
  })

  it('builds rows with merged crews and counts', async () => {
    userFindMany.mockResolvedValue([
      dbUser('a', { internalCrews: [{ crew: { name: 'Crew One' } }], externalCrews: ['crew one', 'Other'] }),
    ])
    submissionFindMany.mockResolvedValue([{ id: 's1', userId: 'a', battleId: 'b1' }])
    voteGroupBy.mockImplementation(async (args: { by: string[] }) =>
      args.by[0] === 'submissionId' ? [{ submissionId: 's1', _count: 3 }] : [{ userId: 'a', _count: 2 }]
    )
    battleFindMany.mockResolvedValue([
      { id: 'b1', startDate: new Date(Date.now() - 20 * day), endDate: new Date(Date.now() - 10 * day) },
    ])

    const rows = await loadAdminUserRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'a',
      email: 'a@example.com',
      role: 'USER',
      status: 'ACTIVE',
      crews: ['Crew One', 'Other'],
      entries: 1,
      battlesWon: 1,
      votesCast: 2,
      votesReceived: 3,
    })
  })

  it('computes wins from other users\' entries but only returns the requested users', async () => {
    userFindMany.mockResolvedValue([dbUser('a')])
    submissionFindMany.mockResolvedValue([
      { id: 's1', userId: 'a', battleId: 'b1' },
      { id: 's2', userId: 'z', battleId: 'b1' },
    ])
    voteGroupBy.mockImplementation(async (args: { by: string[] }) =>
      args.by[0] === 'submissionId' ? [{ submissionId: 's1', _count: 1 }, { submissionId: 's2', _count: 5 }] : []
    )
    battleFindMany.mockResolvedValue([
      { id: 'b1', startDate: new Date(Date.now() - 20 * day), endDate: new Date(Date.now() - 10 * day) },
    ])

    const rows = await loadAdminUserRows(['a'])
    expect(rows.map((r) => r.id)).toEqual(['a'])
    expect(rows[0].battlesWon).toBe(0)
    expect(rows[0].votesReceived).toBe(1)
  })
})
