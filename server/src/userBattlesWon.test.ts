import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    submission: { findMany: vi.fn() },
    battle: { findMany: vi.fn() },
    vote: { groupBy: vi.fn() },
  },
}))

import { db } from './db'
import { countBattlesWon } from './userBattlesWon'

const submissionFindMany = db.submission.findMany as unknown as ReturnType<typeof vi.fn>
const battleFindMany = db.battle.findMany as unknown as ReturnType<typeof vi.fn>
const voteGroupBy = db.vote.groupBy as unknown as ReturnType<typeof vi.fn>

const NOW = new Date('2026-06-01T12:00:00Z')
const past = (id: string) => ({ id, startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2026-02-01T00:00:00Z') })
const open = (id: string) => ({ id, startDate: new Date('2026-05-01T00:00:00Z'), endDate: new Date('2026-07-01T00:00:00Z') })

beforeEach(() => {
  vi.resetAllMocks()
})

/** The user's own entries, then the entries of the completed battles, as the code queries them. */
function setup(args: {
  mine: Array<{ battleId: string }>
  battles: Array<ReturnType<typeof past>>
  entries?: Array<{ id: string; userId: string; battleId: string }>
  counts?: Array<{ submissionId: string; _count: number }>
}) {
  submissionFindMany.mockResolvedValueOnce(args.mine).mockResolvedValueOnce(args.entries ?? [])
  battleFindMany.mockResolvedValue(args.battles)
  voteGroupBy.mockResolvedValue(args.counts ?? [])
}

describe('countBattlesWon', () => {
  it('is 0 without querying further when the user has no entries', async () => {
    submissionFindMany.mockResolvedValueOnce([])
    expect(await countBattlesWon('u1', NOW)).toBe(0)
    expect(battleFindMany).not.toHaveBeenCalled()
  })

  it('never counts a battle that is still open, and does not read its votes', async () => {
    setup({ mine: [{ battleId: 'b1' }], battles: [open('b1')] })
    expect(await countBattlesWon('u1', NOW)).toBe(0)
    expect(voteGroupBy).not.toHaveBeenCalled()
  })

  it('counts a completed battle where the user had the most votes', async () => {
    setup({
      mine: [{ battleId: 'b1' }],
      battles: [past('b1')],
      entries: [{ id: 's1', userId: 'u1', battleId: 'b1' }, { id: 's2', userId: 'u2', battleId: 'b1' }],
      counts: [{ submissionId: 's1', _count: 5 }, { submissionId: 's2', _count: 2 }],
    })
    expect(await countBattlesWon('u1', NOW)).toBe(1)
  })

  it('does not count a battle the user lost', async () => {
    setup({
      mine: [{ battleId: 'b1' }],
      battles: [past('b1')],
      entries: [{ id: 's1', userId: 'u1', battleId: 'b1' }, { id: 's2', userId: 'u2', battleId: 'b1' }],
      counts: [{ submissionId: 's1', _count: 1 }, { submissionId: 's2', _count: 2 }],
    })
    expect(await countBattlesWon('u1', NOW)).toBe(0)
  })

  it('shares a win in a tie', async () => {
    setup({
      mine: [{ battleId: 'b1' }],
      battles: [past('b1')],
      entries: [{ id: 's1', userId: 'u1', battleId: 'b1' }, { id: 's2', userId: 'u2', battleId: 'b1' }],
      counts: [{ submissionId: 's1', _count: 3 }, { submissionId: 's2', _count: 3 }],
    })
    expect(await countBattlesWon('u1', NOW)).toBe(1)
  })

  it('gives no win when a completed battle got no votes', async () => {
    setup({
      mine: [{ battleId: 'b1' }],
      battles: [past('b1')],
      entries: [{ id: 's1', userId: 'u1', battleId: 'b1' }],
      counts: [],
    })
    expect(await countBattlesWon('u1', NOW)).toBe(0)
  })

  it('counts several battles and ignores the open one', async () => {
    setup({
      mine: [{ battleId: 'b1' }, { battleId: 'b2' }, { battleId: 'b3' }],
      battles: [past('b1'), past('b2'), open('b3')],
      entries: [
        { id: 's1', userId: 'u1', battleId: 'b1' },
        { id: 's2', userId: 'u2', battleId: 'b1' },
        { id: 's3', userId: 'u1', battleId: 'b2' },
        { id: 's4', userId: 'u2', battleId: 'b2' },
      ],
      counts: [
        { submissionId: 's1', _count: 4 },
        { submissionId: 's2', _count: 1 },
        { submissionId: 's3', _count: 1 },
        { submissionId: 's4', _count: 9 },
      ],
    })
    expect(await countBattlesWon('u1', NOW)).toBe(1)
    // Only the completed battles' entries and votes are loaded.
    expect(submissionFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { battleId: { in: ['b1', 'b2'] } } }),
    )
    expect(voteGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { battleId: { in: ['b1', 'b2'] } } }),
    )
  })
})
