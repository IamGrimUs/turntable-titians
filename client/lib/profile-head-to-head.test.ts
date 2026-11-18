import { describe, expect, it } from 'vitest'
import {
  HEAD_TO_HEAD_NOTE,
  canChallenge,
  challengeButtonView,
  challengeHref,
  headToHeadCard,
} from './profile-head-to-head'

const viewer = { id: 'u1', username: 'kay' }
const dj = { id: 'u2', username: 'rex' }

describe('canChallenge', () => {
  it('is true for a signed-in viewer with a username looking at another DJ with a username', () => {
    expect(canChallenge(viewer, dj)).toBe(true)
  })

  it('is false for a signed-out visitor', () => {
    expect(canChallenge(null, dj)).toBe(false)
    expect(canChallenge(undefined, dj)).toBe(false)
    expect(canChallenge({ username: 'kay' }, dj)).toBe(false)
  })

  it('is false for a viewer who has not chosen a username yet', () => {
    expect(canChallenge({ id: 'u1', username: null }, dj)).toBe(false)
    expect(canChallenge({ id: 'u1' }, dj)).toBe(false)
    expect(canChallenge({ id: 'u1', username: '   ' }, dj)).toBe(false)
  })

  it('is false on your own profile', () => {
    expect(canChallenge(viewer, { id: 'u1', username: 'kay' })).toBe(false)
  })

  it('is false when the profile user has no username', () => {
    expect(canChallenge(viewer, { id: 'u2', username: null })).toBe(false)
    expect(canChallenge(viewer, { id: 'u2' })).toBe(false)
    expect(canChallenge(viewer, { id: 'u2', username: '  ' })).toBe(false)
  })

  it('is false when there is no profile user', () => {
    expect(canChallenge(viewer, null)).toBe(false)
    expect(canChallenge(viewer, undefined)).toBe(false)
  })
})

describe('challengeHref', () => {
  it('prefills the DJ with an encoded username', () => {
    expect(challengeHref('rex')).toBe('/challenges/new?to=rex')
    expect(challengeHref('a b&c=d/é')).toBe(`/challenges/new?to=${encodeURIComponent('a b&c=d/é')}`)
    expect(challengeHref(' rex ')).toBe('/challenges/new?to=rex')
  })
})

describe('challengeButtonView', () => {
  it('gives the label and link when the viewer may challenge', () => {
    expect(challengeButtonView(viewer, dj)).toEqual({ label: 'Challenge rex', href: '/challenges/new?to=rex' })
  })

  it('is null when the viewer may not challenge', () => {
    expect(challengeButtonView(null, dj)).toBeNull()
    expect(challengeButtonView(viewer, { id: 'u1', username: 'kay' })).toBeNull()
    expect(challengeButtonView(viewer, { id: 'u2', username: null })).toBeNull()
  })
})

const result = (over: Record<string, unknown> = {}) => ({
  battleId: 'b1',
  result: 'WON',
  endedAt: '2026-11-10T00:00:00.000Z',
  opponent: { id: 'u2', username: 'rex', name: 'Rex R', image: null },
  ...over,
})

describe('headToHeadCard', () => {
  it('is null without a record (older cached data or a failed query)', () => {
    expect(headToHeadCard(undefined)).toBeNull()
    expect(headToHeadCard(null)).toBeNull()
  })

  it('is null until the user has a finished duel: no empty card', () => {
    expect(headToHeadCard({ wins: 0, losses: 0, draws: 0, results: [] })).toBeNull()
    expect(headToHeadCard({ wins: 0, losses: 0, draws: 0 })).toBeNull()
  })

  it('treats missing or nonsense counts as zero', () => {
    expect(headToHeadCard({ wins: null, losses: undefined, draws: Number.NaN })).toBeNull()
    expect(headToHeadCard({ wins: -2, losses: 0, draws: 0 })).toBeNull()
  })

  it('shows the W - L - D text, the note and one linked row per result', () => {
    const card = headToHeadCard({
      wins: 2,
      losses: 1,
      draws: 1,
      results: [
        result({ battleId: 'b9', result: 'LOST', opponent: { id: 'u3', username: 'zed', name: null, image: null } }),
        result({ battleId: 'b8', result: 'DRAW' }),
        result({ battleId: 'b7', result: 'WON' }),
      ],
    })
    expect(card).not.toBeNull()
    expect(card!.recordText).toBe('2 - 1 - 1')
    expect(card!.note).toBe(HEAD_TO_HEAD_NOTE)
    expect(card!.note).toBe('Kept separate: does not count toward career wins')
    expect(card!.rows).toEqual([
      { key: 'b9', href: '/battles/b9', opponentName: 'zed', kind: 'LOST', kindLabel: 'Lost' },
      { key: 'b8', href: '/battles/b8', opponentName: 'rex', kind: 'DRAW', kindLabel: 'Draw' },
      { key: 'b7', href: '/battles/b7', opponentName: 'rex', kind: 'WON', kindLabel: 'Won' },
    ])
  })

  it('has a spoken label with the whole record', () => {
    expect(headToHeadCard({ wins: 1, losses: 2, draws: 0, results: [] })!.recordLabel).toBe('1 win, 2 losses, 0 draws')
    expect(headToHeadCard({ wins: 2, losses: 1, draws: 1, results: [] })!.recordLabel).toBe('2 wins, 1 loss, 1 draw')
  })

  it('shows only the last five results', () => {
    const results = Array.from({ length: 8 }, (_, i) => result({ battleId: `b${i}` }))
    const card = headToHeadCard({ wins: 8, losses: 0, draws: 0, results })
    expect(card!.rows.map((r) => r.key)).toEqual(['b0', 'b1', 'b2', 'b3', 'b4'])
  })

  it('still shows the record when the result list is missing', () => {
    const card = headToHeadCard({ wins: 1, losses: 0, draws: 0 })
    expect(card!.recordText).toBe('1 - 0 - 0')
    expect(card!.rows).toEqual([])
  })

  it('names an opponent by username, then name, then a neutral fallback', () => {
    const card = headToHeadCard({
      wins: 3,
      losses: 0,
      draws: 0,
      results: [
        result({ battleId: 'a', opponent: { id: 'x', username: null, name: 'Real Name', image: null } }),
        result({ battleId: 'b', opponent: { id: 'y', username: null, name: null, image: null } }),
        result({ battleId: 'c', opponent: null }),
      ],
    })
    expect(card!.rows.map((r) => r.opponentName)).toEqual(['Real Name', 'A DJ', 'A DJ'])
  })

  it('skips a row without a battle id and keeps an unknown kind readable', () => {
    const card = headToHeadCard({
      wins: 2,
      losses: 0,
      draws: 0,
      results: [result({ battleId: '' }), result({ battleId: 'b2', result: 'FORFEIT' })],
    })
    expect(card!.rows).toEqual([
      { key: 'b2', href: '/battles/b2', opponentName: 'rex', kind: 'FORFEIT', kindLabel: 'Result' },
    ])
  })

  it('encodes the battle id in the link', () => {
    const card = headToHeadCard({ wins: 1, losses: 0, draws: 0, results: [result({ battleId: 'a/b' })] })
    expect(card!.rows[0].href).toBe(`/battles/${encodeURIComponent('a/b')}`)
  })
})
