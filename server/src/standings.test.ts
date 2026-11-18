import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    battle: { findMany: vi.fn() },
    submission: { findMany: vi.fn() },
    vote: { groupBy: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

import { db } from './db'
import { loadCompletedBattles, loadWinnersByBattle, loadHallOfFame, loadUserRecord } from './standings'

const battleFindMany = db.battle.findMany as unknown as ReturnType<typeof vi.fn>
const submissionFindMany = db.submission.findMany as unknown as ReturnType<typeof vi.fn>
const voteGroupBy = db.vote.groupBy as unknown as ReturnType<typeof vi.fn>
const userFindMany = db.user.findMany as unknown as ReturnType<typeof vi.fn>

const NOW = new Date('2026-06-01T12:00:00Z')
const done = (id: string, end = '2026-02-01T00:00:00Z') => ({
  id, startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date(end),
})
const open = (id: string) => ({
  id, startDate: new Date('2026-05-01T00:00:00Z'), endDate: new Date('2026-07-01T00:00:00Z'),
})

beforeEach(() => {
  vi.resetAllMocks()
})

describe('loadCompletedBattles', () => {
  it('returns nothing without reading entries or votes when no battle is completed', async () => {
    battleFindMany.mockResolvedValue([open('b1')])
    expect(await loadCompletedBattles(['b1'], NOW)).toEqual([])
    expect(submissionFindMany).not.toHaveBeenCalled()
    expect(voteGroupBy).not.toHaveBeenCalled()
  })

  it('attaches per-entry vote totals to each completed battle, and only reads totals, not voters', async () => {
    battleFindMany.mockResolvedValue([done('b1'), open('b2')])
    submissionFindMany.mockResolvedValue([
      { id: 's1', userId: 'u1', battleId: 'b1' },
      { id: 's2', userId: 'u2', battleId: 'b1' },
    ])
    voteGroupBy.mockResolvedValue([{ submissionId: 's1', _count: 4 }])
    const result = await loadCompletedBattles(['b1', 'b2'], NOW)
    expect(result).toHaveLength(1)
    expect(result[0].entries).toEqual([
      { userId: 'u1', votes: 4 },
      { userId: 'u2', votes: 0 },
    ])
    expect(voteGroupBy.mock.calls[0][0].by).toEqual(['submissionId'])
    expect(voteGroupBy.mock.calls[0][0].where).toEqual({ battleId: { in: ['b1'] } })
  })

  it('looks at every battle that has already ended when no ids are given', async () => {
    battleFindMany.mockResolvedValue([])
    await loadCompletedBattles(undefined, NOW)
    expect(battleFindMany.mock.calls[0][0].where).toEqual({ endDate: { lt: NOW } })
  })
})

function setupBattle() {
  battleFindMany.mockResolvedValue([done('b1'), done('b2')])
  submissionFindMany.mockResolvedValue([
    { id: 's1', userId: 'u1', battleId: 'b1' },
    { id: 's2', userId: 'u2', battleId: 'b1' },
    { id: 's3', userId: 'u1', battleId: 'b2' },
    { id: 's4', userId: 'u2', battleId: 'b2' },
  ])
  voteGroupBy.mockResolvedValue([
    { submissionId: 's1', _count: 5 },
    { submissionId: 's2', _count: 2 },
    { submissionId: 's3', _count: 1 },
    { submissionId: 's4', _count: 1 },
  ])
}

describe('loadWinnersByBattle', () => {
  it('maps each battle to its winners with one user lookup for all of them', async () => {
    setupBattle()
    userFindMany.mockResolvedValue([
      { id: 'u1', username: 'ann' },
      { id: 'u2', username: 'bob' },
    ])
    const winners = await loadWinnersByBattle(['b1', 'b2'], NOW)
    expect(winners.get('b1')!.map((u) => u.id)).toEqual(['u1'])
    expect(winners.get('b2')!.map((u) => u.id)).toEqual(['u1', 'u2']) // tie: everyone tied wins
    expect(userFindMany).toHaveBeenCalledTimes(1)
  })

  it('leaves out a battle with no votes and does not look up users when nobody won', async () => {
    battleFindMany.mockResolvedValue([done('b1')])
    submissionFindMany.mockResolvedValue([{ id: 's1', userId: 'u1', battleId: 'b1' }])
    voteGroupBy.mockResolvedValue([])
    const winners = await loadWinnersByBattle(['b1'], NOW)
    expect(winners.get('b1')).toEqual([])
    expect(userFindMany).not.toHaveBeenCalled()
  })
})

describe('loadHallOfFame', () => {
  it('returns ranked champions with their users and an ISO last-win date', async () => {
    setupBattle()
    userFindMany.mockResolvedValue([
      { id: 'u1', username: 'ann' },
      { id: 'u2', username: 'bob' },
    ])
    const rows = await loadHallOfFame(NOW)
    expect(rows.map((r) => [r.user.id, r.rank, r.wins, r.battlesEntered])).toEqual([
      ['u1', 1, 2, 2],
      ['u2', 2, 1, 2],
    ])
    expect(rows[0].lastWinAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('skips a champion whose user no longer exists', async () => {
    setupBattle()
    userFindMany.mockResolvedValue([{ id: 'u1', username: 'ann' }])
    const rows = await loadHallOfFame(NOW)
    expect(rows.map((r) => r.user.id)).toEqual(['u1'])
  })

  it('is empty when there are no completed battles', async () => {
    battleFindMany.mockResolvedValue([])
    expect(await loadHallOfFame(NOW)).toEqual([])
    expect(userFindMany).not.toHaveBeenCalled()
  })
})

describe('loadUserRecord', () => {
  it('is all zeros without further queries when the user has no entries', async () => {
    submissionFindMany.mockResolvedValueOnce([])
    expect(await loadUserRecord('u1', NOW)).toEqual({
      wins: 0, podiums: 0, bestFinish: null, currentStreak: 0, bestStreak: 0, battlesEntered: 0,
    })
    expect(battleFindMany).not.toHaveBeenCalled()
  })

  it('builds the record from completed battles only, ignoring open ones', async () => {
    submissionFindMany
      .mockResolvedValueOnce([{ battleId: 'b1' }, { battleId: 'b2' }, { battleId: 'b3' }])
      .mockResolvedValueOnce([
        { id: 's1', userId: 'u1', battleId: 'b1' },
        { id: 's2', userId: 'u2', battleId: 'b1' },
        { id: 's3', userId: 'u1', battleId: 'b2' },
        { id: 's4', userId: 'u2', battleId: 'b2' },
      ])
    battleFindMany.mockResolvedValue([done('b1', '2026-02-01T00:00:00Z'), done('b2', '2026-03-01T00:00:00Z'), open('b3')])
    voteGroupBy.mockResolvedValue([
      { submissionId: 's1', _count: 5 },
      { submissionId: 's2', _count: 2 },
      { submissionId: 's3', _count: 1 },
      { submissionId: 's4', _count: 3 },
    ])
    const record = await loadUserRecord('u1', NOW)
    expect(record).toEqual({ wins: 1, podiums: 2, bestFinish: 1, currentStreak: 0, bestStreak: 1, battlesEntered: 2 })
  })

  it('counts an entry that got no votes as entered but not placed', async () => {
    submissionFindMany
      .mockResolvedValueOnce([{ battleId: 'b1' }])
      .mockResolvedValueOnce([{ id: 's1', userId: 'u1', battleId: 'b1' }])
    battleFindMany.mockResolvedValue([done('b1')])
    voteGroupBy.mockResolvedValue([])
    const record = await loadUserRecord('u1', NOW)
    expect(record.battlesEntered).toBe(1)
    expect(record.bestFinish).toBeNull()
    expect(record.wins).toBe(0)
  })
})
