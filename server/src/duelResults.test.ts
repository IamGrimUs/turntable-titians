import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    challenge: { findMany: vi.fn() },
    vote: { groupBy: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}))

import { db } from './db'
import {
  duelBattleField,
  duelFields,
  headToHeadRecordFields,
  headToHeadResultFields,
  loadDuels,
  loadHeadToHead,
  summarizeHeadToHead,
  userHeadToHead,
} from './duelResults'

const fn = (f: unknown) => f as ReturnType<typeof vi.fn>
const challengeFindMany = fn(db.challenge.findMany)
const voteGroupBy = fn(db.vote.groupBy)
const userFindUnique = fn(db.user.findUnique)

const day = 24 * 3600 * 1000
const NOW = new Date('2026-11-18T12:00:00')
const past = (n: number) => new Date(NOW.getTime() - n * day)
const future = (n: number) => new Date(NOW.getTime() + n * day)

/** An accepted challenge row as `loadDuels` / `loadHeadToHead` select it. */
function row(battleId: string, challengerId: string, opponentId: string, endDate: Date, startDate = past(30)) {
  return {
    battleId,
    challengerId,
    opponentId,
    battle: {
      id: battleId,
      startDate,
      endDate,
      submissions: [
        { id: `${battleId}-s-${challengerId}`, userId: challengerId },
        { id: `${battleId}-s-${opponentId}`, userId: opponentId },
      ],
    },
  }
}
const tally = (battleId: string, userId: string, count: number) => ({ submissionId: `${battleId}-s-${userId}`, _count: count })

beforeEach(() => vi.resetAllMocks())

describe('summarizeHeadToHead', () => {
  const duel = (
    battleId: string,
    challengerId: string,
    opponentId: string,
    outcome: 'CHALLENGER_WON' | 'OPPONENT_WON' | 'DRAW',
    endDate: Date,
  ) => ({ battleId, challengerId, opponentId, outcome, endDate })

  it('counts wins, losses and draws from the user side, whichever role they had', () => {
    const r = summarizeHeadToHead('me', [
      duel('b1', 'me', 'x', 'CHALLENGER_WON', past(1)),
      duel('b2', 'y', 'me', 'OPPONENT_WON', past(2)),
      duel('b3', 'me', 'z', 'OPPONENT_WON', past(3)),
      duel('b4', 'w', 'me', 'CHALLENGER_WON', past(4)),
      duel('b5', 'me', 'v', 'DRAW', past(5)),
    ])
    expect(r.wins).toBe(2)
    expect(r.losses).toBe(2)
    expect(r.draws).toBe(1)
    expect(r.results.map((x) => [x.battleId, x.opponentId, x.result])).toEqual([
      ['b1', 'x', 'WON'],
      ['b2', 'y', 'WON'],
      ['b3', 'z', 'LOST'],
      ['b4', 'w', 'LOST'],
      ['b5', 'v', 'DRAW'],
    ])
  })

  it('treats a 0-0 duel (a DRAW outcome) as a draw', () => {
    expect(summarizeHeadToHead('me', [duel('b1', 'me', 'x', 'DRAW', past(1))])).toMatchObject({ wins: 0, losses: 0, draws: 1 })
  })

  it('lists results newest first whatever the input order', () => {
    const r = summarizeHeadToHead('me', [
      duel('old', 'me', 'x', 'DRAW', past(9)),
      duel('new', 'me', 'x', 'DRAW', past(1)),
      duel('mid', 'me', 'x', 'DRAW', past(5)),
    ])
    expect(r.results.map((x) => x.battleId)).toEqual(['new', 'mid', 'old'])
    expect(r.results[0].endedAt).toEqual(past(1))
  })

  it('ignores a duel the user was not in', () => {
    const r = summarizeHeadToHead('me', [duel('b1', 'a', 'b', 'CHALLENGER_WON', past(1))])
    expect(r).toEqual({ wins: 0, losses: 0, draws: 0, results: [] })
  })
})

describe('loadDuels', () => {
  it('gives a COMPLETED duel its counts and outcome', async () => {
    challengeFindMany.mockResolvedValue([row('b1', 'c', 'o', past(2))])
    voteGroupBy.mockResolvedValue([tally('b1', 'c', 3), tally('b1', 'o', 5)])
    const map = await loadDuels(['b1'], NOW)
    expect(map.get('b1')).toEqual({
      battleId: 'b1',
      challengerId: 'c',
      opponentId: 'o',
      challengerVotes: 3,
      opponentVotes: 5,
      outcome: 'OPPONENT_WON',
    })
  })

  it('treats a missing tally as zero votes and 0-0 as a draw', async () => {
    challengeFindMany.mockResolvedValue([row('b1', 'c', 'o', past(2))])
    voteGroupBy.mockResolvedValue([])
    expect((await loadDuels(['b1'], NOW)).get('b1')).toMatchObject({ challengerVotes: 0, opponentVotes: 0, outcome: 'DRAW' })
  })

  it('keeps an ACTIVE duel secret and does not query vote counts for it', async () => {
    challengeFindMany.mockResolvedValue([row('b1', 'c', 'o', future(2))])
    const map = await loadDuels(['b1'], NOW)
    expect(map.get('b1')).toEqual({
      battleId: 'b1',
      challengerId: 'c',
      opponentId: 'o',
      challengerVotes: null,
      opponentVotes: null,
      outcome: null,
    })
    expect(voteGroupBy).not.toHaveBeenCalled()
  })

  it('keeps an UPCOMING duel secret', async () => {
    challengeFindMany.mockResolvedValue([row('b1', 'c', 'o', future(9), future(1))])
    expect((await loadDuels(['b1'], NOW)).get('b1')).toMatchObject({ outcome: null, challengerVotes: null })
    expect(voteGroupBy).not.toHaveBeenCalled()
  })

  it('leaves a battle that is not a duel out of the map', async () => {
    challengeFindMany.mockResolvedValue([row('b1', 'c', 'o', past(2))])
    voteGroupBy.mockResolvedValue([])
    const map = await loadDuels(['b1', 'regular'], NOW)
    expect(map.has('regular')).toBe(false)
    expect(map.has('b1')).toBe(true)
  })

  it('loads several battles with one challenge query and one vote query, counting only completed ones', async () => {
    challengeFindMany.mockResolvedValue([
      row('b1', 'c', 'o', past(2)),
      row('b2', 'c2', 'o2', past(3)),
      row('b3', 'c3', 'o3', future(3)),
    ])
    voteGroupBy.mockResolvedValue([tally('b1', 'c', 1), tally('b2', 'o2', 2)])
    const map = await loadDuels(['b1', 'b2', 'b3'], NOW)
    expect(challengeFindMany).toHaveBeenCalledTimes(1)
    expect(voteGroupBy).toHaveBeenCalledTimes(1)
    expect(voteGroupBy.mock.calls[0][0].where).toEqual({ battleId: { in: ['b1', 'b2'] } })
    expect(map.get('b1')?.outcome).toBe('CHALLENGER_WON')
    expect(map.get('b2')?.outcome).toBe('OPPONENT_WON')
    expect(map.get('b3')?.outcome).toBeNull()
  })

  it('only reads accepted challenges of the asked battles', async () => {
    challengeFindMany.mockResolvedValue([])
    await loadDuels(['b1'], NOW)
    expect(challengeFindMany.mock.calls[0][0].where).toEqual({ battleId: { in: ['b1'] }, status: 'ACCEPTED' })
  })

  it('does not touch the database for no ids', async () => {
    expect((await loadDuels([], NOW)).size).toBe(0)
    expect(challengeFindMany).not.toHaveBeenCalled()
  })
})

describe('loadHeadToHead', () => {
  it('counts only COMPLETED duels the user was in, newest first', async () => {
    challengeFindMany.mockResolvedValue([
      row('older', 'me', 'x', past(8)),
      row('newer', 'y', 'me', past(2)),
      row('open', 'me', 'z', future(2)),
    ])
    voteGroupBy.mockResolvedValue([
      tally('older', 'me', 4),
      tally('older', 'x', 1),
      tally('newer', 'y', 2),
      tally('newer', 'me', 2),
    ])
    const r = await loadHeadToHead('me', NOW)
    expect(r.wins).toBe(1)
    expect(r.draws).toBe(1)
    expect(r.losses).toBe(0)
    expect(r.results.map((x) => [x.battleId, x.result])).toEqual([
      ['newer', 'DRAW'],
      ['older', 'WON'],
    ])
    expect(voteGroupBy.mock.calls[0][0].where).toEqual({ battleId: { in: ['older', 'newer'] } })
  })

  it('orders duels that end at the same time the same way, whatever order the database returned them in', async () => {
    const end = past(3)
    const rows = [row('b-2', 'me', 'x', end), row('b-1', 'y', 'me', end), row('b-3', 'me', 'z', end)]
    voteGroupBy.mockResolvedValue([tally('b-1', 'me', 1), tally('b-2', 'me', 1), tally('b-3', 'me', 1)])

    challengeFindMany.mockResolvedValue(rows)
    const a = (await loadHeadToHead('me', NOW)).results.map((r) => r.battleId)
    challengeFindMany.mockResolvedValue([...rows].reverse())
    const b = (await loadHeadToHead('me', NOW)).results.map((r) => r.battleId)
    expect(a).toEqual(['b-1', 'b-2', 'b-3'])
    expect(b).toEqual(a)
  })

  it('asks the database for newest first, with the battle id as the tie-break', async () => {
    challengeFindMany.mockResolvedValue([])
    await loadHeadToHead('me', NOW)
    expect(challengeFindMany.mock.calls[0][0].orderBy).toEqual([{ battle: { endDate: 'desc' } }, { battleId: 'asc' }])
  })

  it('selects accepted duels with a battle that involve the user', async () => {
    challengeFindMany.mockResolvedValue([])
    await loadHeadToHead('me', NOW)
    expect(challengeFindMany.mock.calls[0][0].where).toEqual({
      status: 'ACCEPTED',
      battleId: { not: null },
      OR: [{ challengerId: 'me' }, { opponentId: 'me' }],
    })
    expect(voteGroupBy).not.toHaveBeenCalled()
  })
})

describe('Battle.duel', () => {
  const battle = (id: string, endDate: Date) => ({ id, startDate: past(30), endDate }) as never

  it('is null for a regular battle', async () => {
    challengeFindMany.mockResolvedValue([])
    expect(await duelBattleField(battle('regular', past(2)), {}, { userId: null })).toBeNull()
  })

  it('returns the duel for a duel battle', async () => {
    challengeFindMany.mockResolvedValue([row('b1', 'c', 'o', future(2))])
    const d = await duelBattleField(battle('b1', future(2)), {}, { userId: null })
    expect(d).toMatchObject({ battleId: 'b1', challengerId: 'c', opponentId: 'o', outcome: null })
  })

  it('batches a list of battles of one request into one challenge query', async () => {
    challengeFindMany.mockResolvedValue([row('b1', 'c', 'o', future(2)), row('b2', 'c', 'o', future(2))])
    const ctx = { userId: null }
    await Promise.all(['b1', 'b2', 'r'].map((id) => duelBattleField(battle(id, future(2)), {}, ctx)))
    expect(challengeFindMany).toHaveBeenCalledTimes(1)
  })

  it('does not share results between two requests', async () => {
    challengeFindMany.mockResolvedValue([])
    await duelBattleField(battle('b1', future(2)), {}, { userId: null })
    await duelBattleField(battle('b1', future(2)), {}, { userId: null })
    expect(challengeFindMany).toHaveBeenCalledTimes(2)
  })
})

describe('Duel fields', () => {
  const parent = (outcome: 'CHALLENGER_WON' | 'OPPONENT_WON' | 'DRAW' | null) => ({
    battleId: 'b1',
    challengerId: 'c',
    opponentId: 'o',
    challengerVotes: null,
    opponentVotes: null,
    outcome,
  })

  it('resolves both DJs', async () => {
    userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id }))
    expect(await duelFields.challenger(parent(null))).toEqual({ id: 'c' })
    expect(await duelFields.opponent(parent(null))).toEqual({ id: 'o' })
  })

  it('winner is the winning DJ, and null on a draw or before the result', async () => {
    userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id }))
    expect(await duelFields.winner(parent('CHALLENGER_WON'))).toEqual({ id: 'c' })
    expect(await duelFields.winner(parent('OPPONENT_WON'))).toEqual({ id: 'o' })
    userFindUnique.mockClear()
    expect(await duelFields.winner(parent('DRAW'))).toBeNull()
    expect(await duelFields.winner(parent(null))).toBeNull()
    expect(userFindUnique).not.toHaveBeenCalled()
  })
})

describe('User.headToHead', () => {
  it('returns the record of the user', async () => {
    challengeFindMany.mockResolvedValue([row('b1', 'me', 'x', past(2))])
    voteGroupBy.mockResolvedValue([tally('b1', 'me', 1)])
    const rec = await userHeadToHead({ id: 'me' })
    expect(rec).toMatchObject({ wins: 1, losses: 0, draws: 0 })
  })

  it('results honours the limit (default 5, clamped to 1-20)', () => {
    const results = Array.from({ length: 30 }, (_, i) => ({
      battleId: `b${i}`,
      opponentId: 'x',
      result: 'WON' as const,
      endedAt: past(i),
    }))
    const rec = { wins: 30, losses: 0, draws: 0, results }
    const r = headToHeadRecordFields.results
    expect(r(rec, {})).toHaveLength(5)
    expect(r(rec, { limit: 2 })).toHaveLength(2)
    expect(r(rec, { limit: 0 })).toHaveLength(1)
    expect(r(rec, { limit: -4 })).toHaveLength(1)
    expect(r(rec, { limit: 500 })).toHaveLength(20)
  })

  it('a result exposes endedAt as an ISO string and its opponent', async () => {
    const res = { battleId: 'b1', opponentId: 'x', result: 'WON' as const, endedAt: past(1) }
    expect(headToHeadResultFields.endedAt(res)).toBe(past(1).toISOString())
    userFindUnique.mockResolvedValue({ id: 'x' })
    expect(await headToHeadResultFields.opponent(res)).toEqual({ id: 'x' })
  })
})
