import { describe, it, expect } from 'vitest'
import { winnersOfBattle } from './battleResults'
import { placesInBattle, rankChampions, summarizeRecord, type BattleResult } from './battlePlacement'

const d = (day: number) => new Date(Date.UTC(2026, 0, day))

describe('placesInBattle', () => {
  it('places entries by votes, most first', () => {
    const places = placesInBattle([
      { userId: 'a', votes: 3 },
      { userId: 'b', votes: 9 },
      { userId: 'c', votes: 5 },
    ])
    expect([places.get('b'), places.get('c'), places.get('a')]).toEqual([1, 2, 3])
  })

  it('gives tied entries the same place and skips the next one (1, 1, 3)', () => {
    const places = placesInBattle([
      { userId: 'a', votes: 7 },
      { userId: 'b', votes: 7 },
      { userId: 'c', votes: 2 },
    ])
    expect([places.get('a'), places.get('b'), places.get('c')]).toEqual([1, 1, 3])
  })

  it('does not place entries with no votes, and places nobody when nobody got a vote', () => {
    expect(placesInBattle([{ userId: 'a', votes: 0 }, { userId: 'b', votes: 0 }]).size).toBe(0)
    const places = placesInBattle([{ userId: 'a', votes: 4 }, { userId: 'b', votes: 0 }])
    expect(places.has('b')).toBe(false)
    expect(places.get('a')).toBe(1)
  })

  it('agrees with winnersOfBattle on who finished first', () => {
    const cases = [
      [{ userId: 'a', votes: 3 }, { userId: 'b', votes: 3 }, { userId: 'c', votes: 1 }],
      [{ userId: 'a', votes: 0 }, { userId: 'b', votes: 0 }],
      [{ userId: 'a', votes: 10 }],
      [],
    ]
    for (const entries of cases) {
      const first = [...placesInBattle(entries)].filter(([, p]) => p === 1).map(([u]) => u).sort()
      expect(first).toEqual([...winnersOfBattle(entries)].sort())
    }
  })
})

describe('summarizeRecord', () => {
  const r = (battleId: string, day: number, place: number | null, pending = false): BattleResult => ({
    battleId, endDate: d(day), place, pending,
  })

  it('is all zeros with no results', () => {
    expect(summarizeRecord([])).toEqual({
      wins: 0, podiums: 0, bestFinish: null, currentStreak: 0, bestStreak: 0, battlesEntered: 0,
    })
  })

  it('counts wins, podiums (place 3 or better) and the best finish', () => {
    const rec = summarizeRecord([r('b1', 1, 1), r('b2', 2, 3), r('b3', 3, 4), r('b4', 4, null)])
    expect(rec.wins).toBe(1)
    expect(rec.podiums).toBe(2)
    expect(rec.bestFinish).toBe(1)
    expect(rec.battlesEntered).toBe(4)
  })

  it('has no best finish when the user never placed', () => {
    expect(summarizeRecord([r('b1', 1, null)]).bestFinish).toBeNull()
  })

  it('tracks the current and best win streak in end-date order, whatever order they arrive in', () => {
    const rec = summarizeRecord([r('b4', 4, 1), r('b1', 1, 1), r('b3', 3, 2), r('b2', 2, 1), r('b5', 5, 1)])
    // by date: win, win, loss, win, win
    expect(rec.bestStreak).toBe(2)
    expect(rec.currentStreak).toBe(2)
    expect(rec.wins).toBe(4)
  })

  it('breaks the current streak on a latest loss but keeps the best', () => {
    const rec = summarizeRecord([r('b1', 1, 1), r('b2', 2, 1), r('b3', 3, 1), r('b4', 4, 2)])
    expect(rec.currentStreak).toBe(0)
    expect(rec.bestStreak).toBe(3)
  })

  it('skips a pending battle entirely: not entered, no win, and it does not break a streak', () => {
    const rec = summarizeRecord([r('b1', 1, 1), r('b2', 2, null, true), r('b3', 3, 1)])
    expect(rec.battlesEntered).toBe(2)
    expect(rec.wins).toBe(2)
    expect(rec.currentStreak).toBe(2)
  })

  it('orders battles that end the same day by id so the streak is stable', () => {
    const a = summarizeRecord([r('b2', 1, 2), r('b1', 1, 1)])
    const b = summarizeRecord([r('b1', 1, 1), r('b2', 1, 2)])
    expect(a).toEqual(b)
    expect(a.currentStreak).toBe(0)
  })
})

describe('rankChampions', () => {
  // `places` and `pending` arrive as data: the resolver decides them, rankChampions only reads them.
  const battle = (id: string, day: number, entries: Array<[string, number]>, pending = false) => {
    const list = entries.map(([userId, votes]) => ({ userId, votes }))
    return { id, endDate: d(day), entries: list, places: pending ? new Map<string, number>() : placesInBattle(list), pending }
  }

  it('returns nobody when there are no wins', () => {
    expect(rankChampions([])).toEqual([])
    expect(rankChampions([battle('b1', 1, [['a', 0], ['b', 0]])])).toEqual([])
  })

  it('ranks by wins and counts entered battles, including ones the user lost', () => {
    const rows = rankChampions([
      battle('b1', 1, [['a', 5], ['b', 2]]),
      battle('b2', 2, [['a', 4], ['b', 1]]),
      battle('b3', 3, [['a', 1], ['b', 6]]),
    ])
    expect(rows.map((x) => [x.userId, x.rank, x.wins, x.battlesEntered])).toEqual([
      ['a', 1, 2, 3],
      ['b', 2, 1, 3],
    ])
  })

  it('shares a rank for equal wins and skips the next (1, 2, 2, 4)', () => {
    const rows = rankChampions([
      battle('b1', 1, [['a', 9]]),
      battle('b2', 2, [['a', 9]]),
      battle('b3', 3, [['a', 9]]),
      battle('b4', 4, [['b', 9]]),
      battle('b5', 5, [['b', 9]]),
      battle('b6', 6, [['c', 9]]),
      battle('b7', 7, [['c', 9]]),
      battle('b8', 8, [['d', 9]]),
    ])
    // c and b both have 2 wins; c won more recently so it is listed first.
    expect(rows.map((x) => [x.userId, x.rank])).toEqual([['a', 1], ['c', 2], ['b', 2], ['d', 4]])
  })

  it('orders equal wins by most recent win first, then by id', () => {
    const rows = rankChampions([
      battle('b1', 1, [['a', 9]]),
      battle('b2', 2, [['b', 9]]),
      battle('b3', 2, [['c', 9]]),
    ])
    expect(rows.map((x) => x.userId)).toEqual(['b', 'c', 'a'])
  })

  it('gives every tied winner a win, and reports the date of the latest win', () => {
    const rows = rankChampions([
      battle('b1', 1, [['a', 5], ['b', 5]]),
      battle('b2', 7, [['a', 5]]),
    ])
    expect(rows.find((x) => x.userId === 'a')).toMatchObject({ wins: 2, lastWinAt: d(7) })
    expect(rows.find((x) => x.userId === 'b')).toMatchObject({ wins: 1, lastWinAt: d(1) })
  })

  it('reads wins from the places it is given, not from the vote counts', () => {
    // Round one was a tie (5 and 5) but the runoff gave b the win.
    const tied = {
      id: 'b1', endDate: d(1),
      entries: [{ userId: 'a', votes: 5 }, { userId: 'b', votes: 5 }],
      places: new Map([['a', 2], ['b', 1]]),
      pending: false,
    }
    const rows = rankChampions([tied])
    expect(rows.map((x) => [x.userId, x.wins])).toEqual([['b', 1]])
  })

  it('skips a pending battle entirely: no wins, not entered, no last win date', () => {
    const rows = rankChampions([
      battle('b1', 1, [['a', 5], ['b', 2]]),
      battle('b2', 9, [['a', 4], ['b', 4]], true),
    ])
    expect(rows).toEqual([{ userId: 'a', rank: 1, wins: 1, battlesEntered: 1, lastWinAt: d(1) }])
  })

  it('matches the single win rule: a win equals finishing first in placesInBattle', () => {
    const battles = [battle('b1', 1, [['a', 2], ['b', 2], ['c', 1]]), battle('b2', 2, [['c', 3]])]
    const total = rankChampions(battles).reduce((sum, x) => sum + x.wins, 0)
    const expected = battles.reduce((sum, b) => sum + winnersOfBattle(b.entries).size, 0)
    expect(total).toBe(expected)
  })
})
