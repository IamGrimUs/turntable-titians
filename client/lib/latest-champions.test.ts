import { describe, expect, it } from 'vitest'
import { buildLatestChampions, championHeadline, type LatestBattle } from './latest-champions'
import { joinNames, winnerLine } from './hall-of-fame-view'

const person = (id: string, username: string | null = id) => ({ id, username, name: null, image: null })

const battle = (over: Partial<LatestBattle> & { id: string }): LatestBattle => ({
  title: `Battle ${over.id}`,
  endDate: '2026-11-14T12:00:00Z',
  status: 'COMPLETED',
  winningVotes: 10,
  winners: [person('u1')],
  ...over,
})

const hall = (...rows: Array<[string, number]>) => rows.map(([id, wins]) => ({ wins, user: { id } }))

describe('joinNames', () => {
  it('joins one, two and many names the way people write them', () => {
    expect(joinNames(['ann'])).toBe('ann')
    expect(joinNames(['ann', 'bob'])).toBe('ann and bob')
    expect(joinNames(['ann', 'bob', 'cy'])).toBe('ann, bob and cy')
  })

  it('still builds the battle card winner line', () => {
    expect(winnerLine([person('a', 'ann')])).toBe('Won by ann')
    expect(winnerLine([person('a', 'ann'), person('b', 'bob')])).toBe('Tied: ann and bob')
  })
})

describe('buildLatestChampions', () => {
  it('takes the most recent completed battles that have a winner, newest first, three by default', () => {
    const cards = buildLatestChampions(
      [
        battle({ id: 'a', endDate: '2026-10-01T12:00:00Z' }),
        battle({ id: 'b', endDate: '2026-11-14T12:00:00Z' }),
        battle({ id: 'c', endDate: '2026-11-07T12:00:00Z' }),
        battle({ id: 'd', endDate: '2026-09-01T12:00:00Z' }),
      ],
      hall(['u1', 4]),
    )
    expect(cards.map((c) => c.battleId)).toEqual(['b', 'c', 'a'])
  })

  it('skips open battles and battles nobody won', () => {
    const cards = buildLatestChampions(
      [
        battle({ id: 'open', status: 'ACTIVE' }),
        battle({ id: 'upcoming', status: 'UPCOMING' }),
        battle({ id: 'novotes', winners: [], winningVotes: null }),
        battle({ id: 'ok' }),
      ],
      hall(['u1', 1]),
    )
    expect(cards.map((c) => c.battleId)).toEqual(['ok'])
  })

  it('is empty when there is nothing to show', () => {
    expect(buildLatestChampions([], [])).toEqual([])
  })

  it('shows the career win count of a single winner, and none for a tie', () => {
    const [single] = buildLatestChampions([battle({ id: 'a' })], hall(['u1', 4]))
    expect(single.careerWins).toBe(4)

    const [tie] = buildLatestChampions(
      [battle({ id: 'a', winners: [person('u1'), person('u2')] })],
      hall(['u1', 4], ['u2', 2]),
    )
    expect(tie.careerWins).toBeNull()
  })

  it('has no career win count when the winner is not in the Hall of Fame list', () => {
    const [card] = buildLatestChampions([battle({ id: 'a' })], [])
    expect(card.careerWins).toBeNull()
  })

  it('honours a limit and does not modify its input', () => {
    const input = [battle({ id: 'a' }), battle({ id: 'b', endDate: '2026-12-01T12:00:00Z' })]
    const copy = JSON.parse(JSON.stringify(input))
    expect(buildLatestChampions(input, hall(['u1', 1]), 1).map((c) => c.battleId)).toEqual(['b'])
    expect(input).toEqual(copy)
  })
})

describe('championHeadline', () => {
  it('says who won what for one winner', () => {
    const [card] = buildLatestChampions([battle({ id: 'a', title: 'Scratch Showdown', winners: [person('u1', 'nova')] })], [])
    expect(championHeadline(card)).toEqual({ name: 'nova', action: 'won Scratch Showdown' })
  })

  it('says tied for a shared win', () => {
    const [card] = buildLatestChampions(
      [battle({ id: 'a', title: 'Midnight Routine', winners: [person('u1', 'kay'), person('u2', 'nova')] })],
      [],
    )
    expect(championHeadline(card)).toEqual({ name: 'kay and nova', action: 'tied for Midnight Routine' })
  })
})
