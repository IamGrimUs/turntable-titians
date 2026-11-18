import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    submission: { findUnique: vi.fn(), findMany: vi.fn() },
    battle: { findUnique: vi.fn() },
    vote: { groupBy: vi.fn() },
    runoffVote: { upsert: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  },
}))

import { db } from './db'
import { runoffMutation } from './runoffResolvers'

const fn = (f: unknown) => f as ReturnType<typeof vi.fn>
const subFindUnique = fn(db.submission.findUnique)
const subFindMany = fn(db.submission.findMany)
const battleFindUnique = fn(db.battle.findUnique)
const voteGroupBy = fn(db.vote.groupBy)
const upsert = fn(db.runoffVote.upsert)
const deleteMany = fn(db.runoffVote.deleteMany)
const create = fn(db.runoffVote.create)

/* eslint-disable @typescript-eslint/no-explicit-any */
const m = runoffMutation as Record<string, (...args: any[]) => Promise<any>>
/* eslint-enable @typescript-eslint/no-explicit-any */

// The battle ended on 10 June 2026 (local). Its runoff is open 11, 12 and 13 June.
const END = new Date(2026, 5, 10)
const END_DAY = new Date(2026, 5, 10, 12)
const DAY_1 = new Date(2026, 5, 11, 12)
const DAY_3 = new Date(2026, 5, 13, 12)
const DAY_4 = new Date(2026, 5, 14, 12)

const anonymous = { userId: null }
const asVoter = { userId: 'voter', role: 'USER' as const }
const suspended = { userId: 'voter', role: 'USER' as const, suspension: { reason: 'spam', until: null } }

// Entries: sA (owner djA) and sB (owner djB) tie for first with 5; sC (djC) has 2; sD (djD) has 0.
const entries = [
  { id: 'sA', userId: 'djA' },
  { id: 'sB', userId: 'djB' },
  { id: 'sC', userId: 'djC' },
  { id: 'sD', userId: 'djD' },
]
const tiedTallies = [
  { submissionId: 'sA', _count: 5 },
  { submissionId: 'sB', _count: 5 },
  { submissionId: 'sC', _count: 2 },
]

function setupBattle(tallies = tiedTallies, rows = entries) {
  subFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const row = rows.find((r) => r.id === where.id)
    return row ? { battleId: 'b1', userId: row.userId, battle: { endDate: END } } : null
  })
  subFindMany.mockResolvedValue(rows)
  voteGroupBy.mockResolvedValue(tallies)
}

function at(now: Date) {
  vi.useFakeTimers()
  vi.setSystemTime(now)
}

const msg = (p: Promise<unknown>) => p.then(() => null, (e: Error & { extensions?: { code?: string } }) => ({ message: e.message, code: e.extensions?.code }))

beforeEach(() => {
  vi.resetAllMocks()
  at(DAY_1)
  upsert.mockResolvedValue({})
  deleteMany.mockResolvedValue({ count: 0 })
  setupBattle()
})
afterEach(() => vi.useRealTimers())

function expectNoDbUse() {
  for (const f of [subFindUnique, subFindMany, battleFindUnique, voteGroupBy, upsert, deleteMany]) {
    expect(f).not.toHaveBeenCalled()
  }
}

describe('castRunoffVote', () => {
  it('refuses an anonymous caller before any db read', async () => {
    expect(await msg(m.castRunoffVote({}, { submissionId: 'sA' }, anonymous))).toEqual({
      message: 'Not authenticated',
      code: 'UNAUTHENTICATED',
    })
    expectNoDbUse()
  })

  it('refuses a suspended caller before any db read', async () => {
    const err = await msg(m.castRunoffVote({}, { submissionId: 'sA' }, suspended))
    expect(err?.code).toBe('FORBIDDEN')
    expectNoDbUse()
  })

  it('refuses a missing submission with NOT_FOUND', async () => {
    expect(await msg(m.castRunoffVote({}, { submissionId: 'nope' }, asVoter))).toMatchObject({ code: 'NOT_FOUND' })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('refuses an entry that is not in the runoff', async () => {
    for (const id of ['sC', 'sD']) {
      expect(await msg(m.castRunoffVote({}, { submissionId: id }, asVoter))).toEqual({
        message: 'This entry is not in the runoff.',
        code: 'BAD_USER_INPUT',
      })
    }
    expect(upsert).not.toHaveBeenCalled()
  })

  it('refuses when nobody is tied for first', async () => {
    setupBattle([
      { submissionId: 'sA', _count: 5 },
      { submissionId: 'sB', _count: 3 },
    ])
    expect(await msg(m.castRunoffVote({}, { submissionId: 'sA' }, asVoter))).toEqual({
      message: 'This entry is not in the runoff.',
      code: 'BAD_USER_INPUT',
    })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('refuses when only second place is tied', async () => {
    setupBattle([
      { submissionId: 'sA', _count: 5 },
      { submissionId: 'sB', _count: 3 },
      { submissionId: 'sC', _count: 3 },
    ])
    for (const id of ['sA', 'sB', 'sC']) {
      expect(await msg(m.castRunoffVote({}, { submissionId: id }, asVoter))).toMatchObject({
        message: 'This entry is not in the runoff.',
      })
    }
    expect(upsert).not.toHaveBeenCalled()
  })

  it('refuses a battle where everyone has zero votes', async () => {
    setupBattle([])
    expect(await msg(m.castRunoffVote({}, { submissionId: 'sA' }, asVoter))).toMatchObject({
      message: 'This entry is not in the runoff.',
    })
  })

  it.each([
    ['djA', 'sA'],
    ['djA', 'sB'],
    ['djB', 'sA'],
    ['djB', 'sB'],
  ])('refuses %s voting for %s (a candidate cannot vote in the runoff)', async (owner, target) => {
    expect(await msg(m.castRunoffVote({}, { submissionId: target }, { userId: owner, role: 'USER' }))).toEqual({
      message: 'You cannot vote in a runoff you are in.',
      code: 'BAD_USER_INPUT',
    })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('lets a non-tied entrant vote', async () => {
    expect(await m.castRunoffVote({}, { submissionId: 'sA' }, { userId: 'djC', role: 'USER' })).toBe(true)
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('refuses before the window: battle still active', async () => {
    at(new Date(2026, 5, 9, 12))
    expect(await msg(m.castRunoffVote({}, { submissionId: 'sA' }, asVoter))).toEqual({
      message: 'The runoff is not open.',
      code: 'BAD_USER_INPUT',
    })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('refuses on the end day itself', async () => {
    at(END_DAY)
    expect(await msg(m.castRunoffVote({}, { submissionId: 'sA' }, asVoter))).toMatchObject({
      message: 'The runoff is not open.',
    })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('refuses after the window (day 4)', async () => {
    at(DAY_4)
    expect(await msg(m.castRunoffVote({}, { submissionId: 'sA' }, asVoter))).toMatchObject({
      message: 'The runoff is not open.',
    })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('accepts a vote on the last open day (day 3)', async () => {
    at(DAY_3)
    expect(await m.castRunoffVote({}, { submissionId: 'sB' }, asVoter)).toBe(true)
  })

  it('upserts once with the battle derived from the submission', async () => {
    expect(await m.castRunoffVote({}, { submissionId: 'sA' }, asVoter)).toBe(true)
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({
      where: { userId_battleId: { userId: 'voter', battleId: 'b1' } },
      create: { userId: 'voter', battleId: 'b1', submissionId: 'sA' },
      update: { submissionId: 'sA' },
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('voting for the other candidate replaces the choice (upsert, not create)', async () => {
    await m.castRunoffVote({}, { submissionId: 'sA' }, asVoter)
    await m.castRunoffVote({}, { submissionId: 'sB' }, asVoter)
    expect(upsert).toHaveBeenCalledTimes(2)
    expect(upsert.mock.calls[1][0]).toMatchObject({
      where: { userId_battleId: { userId: 'voter', battleId: 'b1' } },
      update: { submissionId: 'sB' },
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('tallies round one for the submission\'s own battle only', async () => {
    await m.castRunoffVote({}, { submissionId: 'sA' }, asVoter)
    expect(voteGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['submissionId'], where: { battleId: 'b1' } }),
    )
    expect(subFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { battleId: 'b1' } }))
  })
})

describe('removeRunoffVote', () => {
  beforeEach(() => battleFindUnique.mockResolvedValue({ id: 'b1', endDate: END }))

  it('refuses anonymous and suspended callers before any db read', async () => {
    expect(await msg(m.removeRunoffVote({}, { battleId: 'b1' }, anonymous))).toMatchObject({ code: 'UNAUTHENTICATED' })
    expect(await msg(m.removeRunoffVote({}, { battleId: 'b1' }, suspended))).toMatchObject({ code: 'FORBIDDEN' })
    expectNoDbUse()
  })

  it('refuses a missing battle with NOT_FOUND', async () => {
    battleFindUnique.mockResolvedValue(null)
    expect(await msg(m.removeRunoffVote({}, { battleId: 'nope' }, asVoter))).toMatchObject({ code: 'NOT_FOUND' })
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it.each([
    ['before the window', new Date(2026, 5, 9, 12)],
    ['on the end day', END_DAY],
    ['after the window', DAY_4],
  ])('refuses %s', async (_label, now) => {
    at(now)
    expect(await msg(m.removeRunoffVote({}, { battleId: 'b1' }, asVoter))).toEqual({
      message: 'The runoff is not open.',
      code: 'BAD_USER_INPUT',
    })
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it('deletes only the caller\'s own vote and returns true', async () => {
    deleteMany.mockResolvedValue({ count: 1 })
    expect(await m.removeRunoffVote({}, { battleId: 'b1' }, asVoter)).toBe(true)
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'voter', battleId: 'b1' } })
  })

  it('returns false when there was no vote', async () => {
    expect(await m.removeRunoffVote({}, { battleId: 'b1' }, asVoter)).toBe(false)
  })
})
