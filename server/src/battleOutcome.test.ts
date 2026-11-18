import { describe, it, expect } from 'vitest'
import { RUNOFF_DAYS, runoffWindow, runoffPhase, tiedForFirst, resolveBattle, type OutcomeEntry } from './battleOutcome'
import { winnersOfBattle } from './battleResults'
import { placesInBattle } from './battlePlacement'

const e = (id: string, userId: string, votes: number): OutcomeEntry => ({ id, userId, votes })

// Local-time dates, like computeBattleStatus
const day = (month: number, date: number, hour = 0) => new Date(2026, month - 1, date, hour)

describe('runoffWindow and runoffPhase', () => {
  it('runs for RUNOFF_DAYS days starting the day after the end date', () => {
    expect(RUNOFF_DAYS).toBe(3)
    const w = runoffWindow(day(11, 14, 18))
    expect(w.opensAt).toEqual(day(11, 15))
    expect(w.endsAt).toEqual(day(11, 17))
  })

  it('is NOT_YET on the end day, OPEN on the first and last runoff days, CLOSED after', () => {
    const end = day(11, 14)
    expect(runoffPhase(end, day(11, 14, 23))).toBe('NOT_YET')
    expect(runoffPhase(end, day(11, 15))).toBe('OPEN')
    expect(runoffPhase(end, day(11, 17, 23))).toBe('OPEN')
    expect(runoffPhase(end, day(11, 18))).toBe('CLOSED')
  })
})

describe('tiedForFirst', () => {
  it('returns both entries tied at the top', () => {
    const a = e('s1', 'a', 5)
    const b = e('s2', 'b', 5)
    expect(tiedForFirst([a, b, e('s3', 'c', 2)])).toEqual([a, b])
  })

  it('returns nothing when the top is zero votes', () => {
    expect(tiedForFirst([e('s1', 'a', 0), e('s2', 'b', 0)])).toEqual([])
  })

  it('returns nothing for a single leader', () => {
    expect(tiedForFirst([e('s1', 'a', 5), e('s2', 'b', 3)])).toEqual([])
  })

  it('returns nothing when only second place is tied', () => {
    expect(tiedForFirst([e('s1', 'a', 9), e('s2', 'b', 4), e('s3', 'c', 4)])).toEqual([])
  })
})

describe('resolveBattle', () => {
  const end = day(11, 14)
  const during = day(11, 16)
  const after = day(11, 20)
  const noRunoff = new Map<string, number>()

  it('matches winnersOfBattle and placesInBattle exactly when there is no tie for first', () => {
    const tables: OutcomeEntry[][] = [
      [],
      [e('s1', 'a', 0), e('s2', 'b', 0)],
      [e('s1', 'a', 5)],
      [e('s1', 'a', 5), e('s2', 'b', 3), e('s3', 'c', 3), e('s4', 'd', 0)],
      [e('s1', 'a', 9), e('s2', 'b', 4), e('s3', 'c', 4)],
    ]
    for (const entries of tables) {
      for (const now of [during, after]) {
        const r = resolveBattle({ endDate: end, entries, runoffVotes: noRunoff, now })
        expect(r.runoff).toBeNull()
        expect(r.pending).toBe(false)
        expect(r.winnerUserIds).toEqual(winnersOfBattle(entries))
        expect(r.places).toEqual(placesInBattle(entries))
      }
    }
  })

  it('uses round one while the runoff has not opened yet, even with a tie', () => {
    const entries = [e('s1', 'a', 5), e('s2', 'b', 5)]
    const r = resolveBattle({ endDate: end, entries, runoffVotes: noRunoff, now: day(11, 14, 12) })
    expect(r.runoff).toBeNull()
    expect(r.pending).toBe(false)
    expect(r.winnerUserIds).toEqual(winnersOfBattle(entries))
    expect(r.places).toEqual(placesInBattle(entries))
  })

  it('is pending while the runoff is OPEN, hiding winners, places and runoff votes', () => {
    const entries = [e('s1', 'a', 5), e('s2', 'b', 5), e('s3', 'c', 1)]
    const r = resolveBattle({
      endDate: end,
      entries,
      runoffVotes: new Map([['s1', 7], ['s2', 2]]),
      now: during,
    })
    expect(r.pending).toBe(true)
    expect(r.winnerUserIds.size).toBe(0)
    expect(r.places.size).toBe(0)
    expect(r.runoff).toEqual({
      status: 'OPEN',
      candidates: [
        { id: 's1', userId: 'a', votes: null },
        { id: 's2', userId: 'b', votes: null },
      ],
    })
  })

  it('decides a sole winner when the runoff is closed 31 to 24, third place keeps place 3', () => {
    const entries = [e('s1', 'a', 5), e('s2', 'b', 5), e('s3', 'c', 1)]
    const r = resolveBattle({
      endDate: end,
      entries,
      runoffVotes: new Map([['s1', 31], ['s2', 24]]),
      now: after,
    })
    expect(r.pending).toBe(false)
    expect([...r.winnerUserIds]).toEqual(['a'])
    expect(r.places).toEqual(new Map([['a', 1], ['b', 2], ['c', 3]]))
    expect(r.runoff).toEqual({
      status: 'DECIDED',
      candidates: [
        { id: 's1', userId: 'a', votes: 31 },
        { id: 's2', userId: 'b', votes: 24 },
      ],
    })
  })

  it('stays TIED when the runoff ends level, both win and place 1', () => {
    const entries = [e('s1', 'a', 5), e('s2', 'b', 5)]
    const r = resolveBattle({
      endDate: end,
      entries,
      runoffVotes: new Map([['s1', 10], ['s2', 10]]),
      now: after,
    })
    expect(r.runoff?.status).toBe('TIED')
    expect(r.winnerUserIds).toEqual(new Set(['a', 'b']))
    expect(r.places).toEqual(new Map([['a', 1], ['b', 1]]))
  })

  it('is TIED with every candidate winning when nobody voted in the runoff', () => {
    const entries = [e('s1', 'a', 5), e('s2', 'b', 5)]
    const r = resolveBattle({ endDate: end, entries, runoffVotes: noRunoff, now: after })
    expect(r.runoff?.status).toBe('TIED')
    expect(r.runoff?.candidates.map((c) => c.votes)).toEqual([0, 0])
    expect(r.winnerUserIds).toEqual(new Set(['a', 'b']))
    expect(r.places).toEqual(new Map([['a', 1], ['b', 1]]))
  })

  it('shares the win between two of three candidates (10/10/4): places 1,1,3, TIED', () => {
    const entries = [e('s1', 'a', 8), e('s2', 'b', 8), e('s3', 'c', 8)]
    const r = resolveBattle({
      endDate: end,
      entries,
      runoffVotes: new Map([['s1', 10], ['s2', 10], ['s3', 4]]),
      now: after,
    })
    expect(r.runoff?.status).toBe('TIED')
    expect(r.winnerUserIds).toEqual(new Set(['a', 'b']))
    expect(r.places).toEqual(new Map([['a', 1], ['b', 1], ['c', 3]]))
  })

  it('has a sole winner in a three-way runoff of 10/6/6: places 1,2,2', () => {
    const entries = [e('s1', 'a', 8), e('s2', 'b', 8), e('s3', 'c', 8)]
    const r = resolveBattle({
      endDate: end,
      entries,
      runoffVotes: new Map([['s1', 10], ['s2', 6], ['s3', 6]]),
      now: after,
    })
    expect(r.runoff?.status).toBe('DECIDED')
    expect(r.winnerUserIds).toEqual(new Set(['a']))
    expect(r.places).toEqual(new Map([['a', 1], ['b', 2], ['c', 2]]))
  })
})
