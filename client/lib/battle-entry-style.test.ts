import { describe, expect, it } from 'vitest'
import { entryStyle, type EntryStyleInput } from './battle-entry-style'

const base: EntryStyleInput = {
  battleStatus: 'COMPLETED',
  hasRunoff: false,
  winnerUserIds: [],
  userId: 'u1',
  rank: 1,
  voteCount: 5,
}

describe('entryStyle with no runoff (unchanged behaviour)', () => {
  it('crowns the server winner and gives no rank badge', () => {
    const s = entryStyle({ ...base, winnerUserIds: ['u1'] })
    expect(s).toEqual({ isWinner: true, badge: null, podium: true })
  })

  it('shares the crown between tied winners', () => {
    expect(entryStyle({ ...base, winnerUserIds: ['u1', 'u2'] }).isWinner).toBe(true)
    expect(entryStyle({ ...base, userId: 'u2', rank: 2, winnerUserIds: ['u1', 'u2'] }).isWinner).toBe(true)
  })

  it('badges second and third place when they have votes', () => {
    expect(entryStyle({ ...base, userId: 'u2', rank: 2, voteCount: 3, winnerUserIds: ['u1'] })).toEqual({
      isWinner: false,
      badge: 'RANK_2',
      podium: false,
    })
    expect(entryStyle({ ...base, userId: 'u3', rank: 3, voteCount: 1, winnerUserIds: ['u1'] }).badge).toBe('RANK_3')
  })

  it('gives no badge to a zero-vote entry, nor to fourth place', () => {
    expect(entryStyle({ ...base, userId: 'u2', rank: 2, voteCount: 0, winnerUserIds: ['u1'] }).badge).toBeNull()
    expect(entryStyle({ ...base, userId: 'u4', rank: 4, voteCount: 2, winnerUserIds: ['u1'] })).toEqual({
      isWinner: false,
      badge: null,
      podium: false,
    })
  })

  it('has no winner, badge or podium while the battle is not completed', () => {
    for (const battleStatus of ['UPCOMING', 'ACTIVE'] as const) {
      expect(entryStyle({ ...base, battleStatus, voteCount: null, winnerUserIds: [] })).toEqual({
        isWinner: false,
        badge: null,
        podium: false,
      })
    }
  })

  it('keeps the gold border on first place of a completed battle nobody voted in (as before)', () => {
    expect(entryStyle({ ...base, voteCount: 0, winnerUserIds: [] })).toEqual({
      isWinner: false,
      badge: null,
      podium: true,
    })
  })

  it('does not crown anyone when nobody won', () => {
    expect(entryStyle({ ...base, voteCount: 0, winnerUserIds: [] }).isWinner).toBe(false)
  })
})

describe('entryStyle with a runoff', () => {
  const tied = { ...base, hasRunoff: true, voteCount: 4 }

  it('OPEN: nobody is crowned, no badges, no podium (the server sends no winners)', () => {
    for (const [userId, rank] of [['u1', 1], ['u2', 2], ['u3', 3]] as const) {
      expect(entryStyle({ ...tied, userId, rank, winnerUserIds: [] })).toEqual({
        isWinner: false,
        badge: null,
        podium: false,
      })
    }
  })

  it('DECIDED: only the server winner is crowned, the other tied entry is not', () => {
    const winnerUserIds = ['u2']
    expect(entryStyle({ ...tied, userId: 'u1', rank: 1, winnerUserIds }).isWinner).toBe(false)
    expect(entryStyle({ ...tied, userId: 'u2', rank: 2, winnerUserIds }).isWinner).toBe(true)
  })

  it('DECIDED: nobody gets rank badges or the podium border', () => {
    const winnerUserIds = ['u2']
    expect(entryStyle({ ...tied, userId: 'u1', rank: 1, winnerUserIds })).toEqual({
      isWinner: false,
      badge: null,
      podium: false,
    })
    expect(entryStyle({ ...tied, userId: 'u3', rank: 3, voteCount: 2, winnerUserIds })).toEqual({
      isWinner: false,
      badge: null,
      podium: false,
    })
    expect(entryStyle({ ...tied, userId: 'u2', rank: 2, winnerUserIds }).badge).toBeNull()
  })

  it('TIED: every shared winner is crowned, others are not', () => {
    const winnerUserIds = ['u1', 'u2']
    expect(entryStyle({ ...tied, userId: 'u1', rank: 1, winnerUserIds }).isWinner).toBe(true)
    expect(entryStyle({ ...tied, userId: 'u2', rank: 2, winnerUserIds }).isWinner).toBe(true)
    expect(entryStyle({ ...tied, userId: 'u3', rank: 3, voteCount: 1, winnerUserIds })).toEqual({
      isWinner: false,
      badge: null,
      podium: false,
    })
  })

  it('never decides from votes: equal round-one votes and no winners means no crown', () => {
    expect(entryStyle({ ...tied, voteCount: 9, winnerUserIds: [] }).isWinner).toBe(false)
  })
})
