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
import { loadCompletedBattles, loadOutcomesByBattle, loadHallOfFame, loadUserRecord } from './standings'

const battleFindMany = db.battle.findMany as unknown as ReturnType<typeof vi.fn>
const submissionFindMany = db.submission.findMany as unknown as ReturnType<typeof vi.fn>
const voteGroupBy = db.vote.groupBy as unknown as ReturnType<typeof vi.fn>
const runoffGroupBy = db.runoffVote.groupBy as unknown as ReturnType<typeof vi.fn>
const userFindMany = db.user.findMany as unknown as ReturnType<typeof vi.fn>

const NOW = new Date('2026-06-01T12:00:00Z')
const done = (id: string, end = '2026-02-01T00:00:00Z') => ({
  id, startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date(end),
})
// Ended the day before NOW, so a runoff on this battle is still OPEN.
const OPEN_RUNOFF_END = '2026-05-31T12:00:00Z'
const open = (id: string) => ({
  id, startDate: new Date('2026-05-01T00:00:00Z'), endDate: new Date('2026-07-01T00:00:00Z'),
})

beforeEach(() => {
  vi.resetAllMocks()
  runoffGroupBy.mockResolvedValue([]) // no runoff votes unless a test says so
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
      { id: 's1', userId: 'u1', votes: 4 },
      { id: 's2', userId: 'u2', votes: 0 },
    ])
    expect(result[0].resolution.winnerUserIds).toEqual(new Set(['u1']))
    expect(voteGroupBy.mock.calls[0][0].by).toEqual(['submissionId'])
    expect(voteGroupBy.mock.calls[0][0].where).toEqual({ battleId: { in: ['b1'] } })
  })

  it('makes no runoff query when no completed battle ties for first', async () => {
    battleFindMany.mockResolvedValue([done('b1'), done('b2')])
    submissionFindMany.mockResolvedValue([
      { id: 's1', userId: 'u1', battleId: 'b1' },
      { id: 's2', userId: 'u2', battleId: 'b1' },
      { id: 's3', userId: 'u1', battleId: 'b2' },
      { id: 's4', userId: 'u2', battleId: 'b2' },
    ])
    // b1 has a single leader; b2 ties only for second place.
    voteGroupBy.mockResolvedValue([
      { submissionId: 's1', _count: 4 },
      { submissionId: 's2', _count: 1 },
    ])
    await loadCompletedBattles(['b1', 'b2'], NOW)
    expect(runoffGroupBy).not.toHaveBeenCalled()
  })

  it('loads runoff tallies with one query for just the battles that tie for first', async () => {
    battleFindMany.mockResolvedValue([done('b1'), done('b2'), done('b3')])
    submissionFindMany.mockResolvedValue([
      { id: 's1', userId: 'u1', battleId: 'b1' },
      { id: 's2', userId: 'u2', battleId: 'b1' },
      { id: 's3', userId: 'u1', battleId: 'b2' },
      { id: 's4', userId: 'u2', battleId: 'b2' },
      { id: 's5', userId: 'u1', battleId: 'b3' },
      { id: 's6', userId: 'u2', battleId: 'b3' },
    ])
    voteGroupBy.mockResolvedValue([
      { submissionId: 's1', _count: 3 },
      { submissionId: 's2', _count: 3 }, // b1 ties for first
      { submissionId: 's3', _count: 5 },
      { submissionId: 's4', _count: 1 }, // b2 does not
      { submissionId: 's5', _count: 2 },
      { submissionId: 's6', _count: 2 }, // b3 ties for first
    ])
    runoffGroupBy.mockResolvedValue([
      { submissionId: 's1', _count: 1 },
      { submissionId: 's2', _count: 4 },
    ])
    const result = await loadCompletedBattles(['b1', 'b2', 'b3'], NOW)
    expect(runoffGroupBy).toHaveBeenCalledTimes(1)
    expect(runoffGroupBy).toHaveBeenCalledWith({
      by: ['submissionId'],
      where: { battleId: { in: ['b1', 'b3'] } },
      _count: true,
    })
    const byId = new Map(result.map((b) => [b.id, b.resolution]))
    expect(byId.get('b1')!.winnerUserIds).toEqual(new Set(['u2'])) // runoff decided it
    expect(byId.get('b1')!.runoff?.status).toBe('DECIDED')
    expect(byId.get('b2')!.winnerUserIds).toEqual(new Set(['u1']))
    expect(byId.get('b2')!.runoff).toBeNull()
    expect(byId.get('b3')!.runoff?.status).toBe('TIED') // no runoff votes: level, shared win
    expect(byId.get('b3')!.winnerUserIds).toEqual(new Set(['u1', 'u2']))
  })

  it('treats a battle in an open runoff as pending', async () => {
    battleFindMany.mockResolvedValue([done('b1', OPEN_RUNOFF_END)])
    submissionFindMany.mockResolvedValue([
      { id: 's1', userId: 'u1', battleId: 'b1' },
      { id: 's2', userId: 'u2', battleId: 'b1' },
    ])
    voteGroupBy.mockResolvedValue([
      { submissionId: 's1', _count: 3 },
      { submissionId: 's2', _count: 3 },
    ])
    runoffGroupBy.mockResolvedValue([])
    const [b] = await loadCompletedBattles(['b1'], NOW)
    expect(b.resolution.pending).toBe(true)
    expect(b.resolution.runoff?.status).toBe('OPEN')
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

describe('loadOutcomesByBattle', () => {
  it('maps each battle to its winners and winning vote total with one user lookup for all of them', async () => {
    setupBattle()
    userFindMany.mockResolvedValue([
      { id: 'u1', username: 'ann' },
      { id: 'u2', username: 'bob' },
    ])
    const outcomes = await loadOutcomesByBattle(['b1', 'b2'], NOW)
    expect(outcomes.get('b1')!.winners.map((u) => u.id)).toEqual(['u1'])
    expect(outcomes.get('b1')!.winningVotes).toBe(5)
    expect(outcomes.get('b2')!.winners.map((u) => u.id)).toEqual(['u1', 'u2']) // tie: everyone tied wins
    expect(outcomes.get('b2')!.winningVotes).toBe(1) // the tied top total
    expect(userFindMany).toHaveBeenCalledTimes(1)
  })

  it('leaves out a battle with no votes and does not look up users when nobody won', async () => {
    battleFindMany.mockResolvedValue([done('b1')])
    submissionFindMany.mockResolvedValue([{ id: 's1', userId: 'u1', battleId: 'b1' }])
    voteGroupBy.mockResolvedValue([])
    const outcomes = await loadOutcomesByBattle(['b1'], NOW)
    expect(outcomes.get('b1')).toEqual({ winners: [], winningVotes: null, runoff: null })
    expect(userFindMany).not.toHaveBeenCalled()
  })

  it('lets a runoff decide the winner, keeping the round-one total as winningVotes', async () => {
    battleFindMany.mockResolvedValue([done('b1')])
    submissionFindMany.mockResolvedValue([
      { id: 's1', userId: 'u1', battleId: 'b1' },
      { id: 's2', userId: 'u2', battleId: 'b1' },
    ])
    voteGroupBy.mockResolvedValue([
      { submissionId: 's1', _count: 3 },
      { submissionId: 's2', _count: 3 },
    ])
    runoffGroupBy.mockResolvedValue([{ submissionId: 's2', _count: 2 }])
    userFindMany.mockResolvedValue([{ id: 'u1', username: 'ann' }, { id: 'u2', username: 'bob' }])
    const outcome = (await loadOutcomesByBattle(['b1'], NOW)).get('b1')!
    expect(outcome.winners.map((u) => u.id)).toEqual(['u2'])
    expect(outcome.winningVotes).toBe(3)
    expect(outcome.runoff).toEqual({
      status: 'DECIDED',
      candidates: [
        { id: 's1', userId: 'u1', votes: 0 },
        { id: 's2', userId: 'u2', votes: 2 },
      ],
    })
  })

  it('has no winners and no winning total while the runoff is open', async () => {
    battleFindMany.mockResolvedValue([done('b1', OPEN_RUNOFF_END)])
    submissionFindMany.mockResolvedValue([
      { id: 's1', userId: 'u1', battleId: 'b1' },
      { id: 's2', userId: 'u2', battleId: 'b1' },
    ])
    voteGroupBy.mockResolvedValue([
      { submissionId: 's1', _count: 3 },
      { submissionId: 's2', _count: 3 },
    ])
    runoffGroupBy.mockResolvedValue([])
    const outcome = (await loadOutcomesByBattle(['b1'], NOW)).get('b1')!
    expect(outcome.winners).toEqual([])
    expect(outcome.winningVotes).toBeNull()
    expect(outcome.runoff?.status).toBe('OPEN')
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

  it('leaves a battle in an open runoff out of wins and battles entered', async () => {
    battleFindMany.mockResolvedValue([done('b1'), done('b2', OPEN_RUNOFF_END)])
    submissionFindMany.mockResolvedValue([
      { id: 's1', userId: 'u1', battleId: 'b1' },
      { id: 's2', userId: 'u2', battleId: 'b1' },
      { id: 's3', userId: 'u1', battleId: 'b2' },
      { id: 's4', userId: 'u2', battleId: 'b2' },
    ])
    voteGroupBy.mockResolvedValue([
      { submissionId: 's1', _count: 5 },
      { submissionId: 's2', _count: 1 },
      { submissionId: 's3', _count: 2 },
      { submissionId: 's4', _count: 2 },
    ])
    runoffGroupBy.mockResolvedValue([])
    userFindMany.mockResolvedValue([{ id: 'u1', username: 'ann' }])
    const rows = await loadHallOfFame(NOW)
    expect(rows.map((r) => [r.user.id, r.wins, r.battlesEntered])).toEqual([['u1', 1, 1]])
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

  it('ignores a battle in an open runoff, and uses the runoff result once it has closed', async () => {
    submissionFindMany
      .mockResolvedValueOnce([{ battleId: 'b1' }, { battleId: 'b2' }])
      .mockResolvedValueOnce([
        { id: 's1', userId: 'u1', battleId: 'b1' },
        { id: 's2', userId: 'u2', battleId: 'b1' },
        { id: 's3', userId: 'u1', battleId: 'b2' },
        { id: 's4', userId: 'u2', battleId: 'b2' },
      ])
    battleFindMany.mockResolvedValue([done('b1'), done('b2', OPEN_RUNOFF_END)])
    voteGroupBy.mockResolvedValue([
      { submissionId: 's1', _count: 3 },
      { submissionId: 's2', _count: 3 },
      { submissionId: 's3', _count: 2 },
      { submissionId: 's4', _count: 2 },
    ])
    runoffGroupBy.mockResolvedValue([{ submissionId: 's2', _count: 1 }]) // b1 closed: u2 wins
    expect(await loadUserRecord('u1', NOW)).toEqual({
      wins: 0, podiums: 1, bestFinish: 2, currentStreak: 0, bestStreak: 0, battlesEntered: 1,
    })
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
