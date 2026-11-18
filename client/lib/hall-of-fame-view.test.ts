import { describe, expect, it } from 'vitest'
import {
  RESULTS_PAGE_SIZE,
  buildResultRows,
  displayName,
  groupRowsByMonth,
  initialsOf,
  isTopThree,
  noWinnerText,
  resultTypes,
  winRate,
  winnerLine,
  type ResultBattle,
} from './hall-of-fame-view'

const person = (id: string, username: string | null = id, name: string | null = null) => ({
  id, username, name, image: null,
})

const battle = (over: Partial<ResultBattle> & { id: string }): ResultBattle => ({
  title: over.id,
  type: 'Scratch',
  endDate: '2026-11-14T12:00:00Z',
  status: 'COMPLETED',
  winners: [],
  winningVotes: null,
  submissions: [{ id: 's1' }, { id: 's2' }],
  runoff: null,
  ...over,
})

describe('names and initials', () => {
  it('prefers username, then name, then "DJ"', () => {
    expect(displayName(person('a', 'nova'))).toBe('nova')
    expect(displayName(person('a', null, 'Real Name'))).toBe('Real Name')
    expect(displayName(person('a', null, null))).toBe('DJ')
  })

  it('takes the first two letters in capitals', () => {
    expect(initialsOf(person('a', 'nova'))).toBe('NO')
    expect(initialsOf(person('a', null, null))).toBe('DJ')
  })
})

describe('winRate', () => {
  it('is wins over battles entered, rounded to a whole percent', () => {
    expect(winRate(7, 12)).toBe('58%')
    expect(winRate(1, 3)).toBe('33%')
    expect(winRate(4, 4)).toBe('100%')
  })

  it('shows a dash instead of dividing by zero', () => {
    expect(winRate(0, 0)).toBe('–')
  })
})

describe('isTopThree', () => {
  it('highlights ranks 1 to 3 only', () => {
    expect([1, 2, 3, 4, 10].map(isTopThree)).toEqual([true, true, true, false, false])
  })
})

describe('winnerLine', () => {
  it('is null when nobody won', () => {
    expect(winnerLine([])).toBeNull()
  })

  it('names one, two or many winners', () => {
    expect(winnerLine([person('a', 'ann')])).toBe('Won by ann')
    expect(winnerLine([person('a', 'ann'), person('b', 'bob')])).toBe('Tied: ann and bob')
    expect(winnerLine([person('a', 'ann'), person('b', 'bob'), person('c', 'cy')])).toBe('Tied: ann, bob and cy')
  })
})

describe('buildResultRows', () => {
  it('keeps only completed battles, newest end date first, ties broken by id', () => {
    const rows = buildResultRows(
      [
        battle({ id: 'old', endDate: '2026-10-01T12:00:00Z' }),
        battle({ id: 'open', status: 'ACTIVE' }),
        battle({ id: 'soon', status: 'UPCOMING' }),
        battle({ id: 'b2', endDate: '2026-11-14T12:00:00Z' }),
        battle({ id: 'b1', endDate: '2026-11-14T12:00:00Z' }),
      ],
      null,
    )
    expect(rows.map((r) => r.id)).toEqual(['b1', 'b2', 'old'])
  })

  it('never lists an open battle even if the API sent winners for it', () => {
    const rows = buildResultRows([battle({ id: 'x', status: 'ACTIVE', winners: [person('a')] })], null)
    expect(rows).toEqual([])
  })

  it('filters by type when one is chosen', () => {
    const rows = buildResultRows([battle({ id: 'a', type: 'Scratch' }), battle({ id: 'b', type: 'Mix' })], 'Mix')
    expect(rows.map((r) => r.id)).toEqual(['b'])
  })

  it('shows the winners with the winning vote total, and marks a tie', () => {
    const [row] = buildResultRows(
      [battle({ id: 'a', winners: [person('a', 'ann'), person('b', 'bob')], winningVotes: 88 })],
      null,
    )
    expect(row.winners.map((w) => displayName(w.user))).toEqual(['ann', 'bob'])
    expect(row.winners[0].votes).toBe(88)
    expect(row.tie).toBe(true)
    expect(row.noWinner).toBe(false)
  })

  it('marks a completed battle with no winner, and counts its entries', () => {
    const [row] = buildResultRows([battle({ id: 'a', submissions: [{ id: '1' }, { id: '2' }, { id: '3' }] })], null)
    expect(row.noWinner).toBe(true)
    expect(row.tie).toBe(false)
    expect(row.entries).toBe(3)
  })

  it('falls back to "Other" for a battle with no type', () => {
    const [row] = buildResultRows([battle({ id: 'a', type: null })], null)
    expect(row.type).toBe('Other')
  })

  it('does not modify its input', () => {
    const input = [battle({ id: 'b' }), battle({ id: 'a', endDate: '2026-12-01T12:00:00Z' })]
    const copy = JSON.parse(JSON.stringify(input))
    buildResultRows(input, null)
    expect(input).toEqual(copy)
  })
})

// What the server sends (midnight UTC); "ends Nov 20" must read the same in every timezone.
const nov20 = '2026-11-20T00:00:00.000Z'

const runoffOf = (status: 'OPEN' | 'DECIDED' | 'TIED', votes: [number | null, number | null]) => ({
  status,
  endsAt: nov20,
  candidates: [
    { submission: { user: person('n', 'nova') }, votes: votes[0] },
    { submission: { user: person('k', 'kay') }, votes: votes[1] },
  ],
})

describe('buildResultRows with a runoff', () => {
  it('an open runoff is not "no winner": no winner row, a runoff status and the in-progress line', () => {
    const [row] = buildResultRows(
      [battle({ id: 'r', winners: [], winningVotes: null, runoff: runoffOf('OPEN', [null, null]) })],
      null,
    )
    expect(row.noWinner).toBe(false)
    expect(row.winners).toEqual([])
    expect(row.tie).toBe(false)
    expect(row.runoff?.status).toBe('OPEN')
    expect(row.runoff?.label).toBe('RUNOFF')
    expect(row.runoff?.line).toBe('Runoff in progress: nova vs kay, ends Nov 20')
  })

  it('an open runoff shows no winners even if some were sent for it', () => {
    const [row] = buildResultRows(
      [battle({ id: 'r', winners: [person('n', 'nova'), person('k', 'kay')], winningVotes: 12, runoff: runoffOf('OPEN', [null, null]) })],
      null,
    )
    expect(row.winners).toEqual([])
    expect(row.tie).toBe(false)
    expect(row.noWinner).toBe(false)
  })

  it('a decided runoff shows the one winner and the runoff result, not the round-one total', () => {
    const [row] = buildResultRows(
      [battle({ id: 'r', winners: [person('k', 'kay')], winningVotes: 12, runoff: runoffOf('DECIDED', [24, 31]) })],
      null,
    )
    expect(row.noWinner).toBe(false)
    expect(row.winners.map((w) => displayName(w.user))).toEqual(['kay'])
    expect(row.winners[0].votes).toBeNull()
    expect(row.tie).toBe(false)
    expect(row.runoff?.status).toBe('DECIDED')
    expect(row.runoff?.label).toBe('COMPLETED')
    expect(row.runoff?.line).toBe('Won by kay (runoff, 31 to 24)')
  })

  it('a runoff that also ended level shares the win', () => {
    const [row] = buildResultRows(
      [battle({ id: 'r', winners: [person('n', 'nova'), person('k', 'kay')], winningVotes: 12, runoff: runoffOf('TIED', [5, 5]) })],
      null,
    )
    expect(row.noWinner).toBe(false)
    expect(row.tie).toBe(true)
    expect(row.winners.map((w) => displayName(w.user))).toEqual(['nova', 'kay'])
    expect(row.runoff?.line).toBe('Tied: nova and kay (runoff level)')
  })

  it('a battle with no runoff keeps its round-one votes and has no runoff field', () => {
    const [row] = buildResultRows([battle({ id: 'a', winners: [person('a', 'ann')], winningVotes: 9, runoff: null })], null)
    expect(row.runoff).toBeNull()
    expect(row.winners[0].votes).toBe(9)
  })

  it('a battle that really had no votes (no runoff) is still "no winner"', () => {
    const [row] = buildResultRows([battle({ id: 'a', winners: [], runoff: null })], null)
    expect(row.noWinner).toBe(true)
    expect(row.runoff).toBeNull()
    expect(noWinnerText(row.entries)).toBe('No winner: nobody voted')
  })

  it('a missing runoff field (older response) counts as no runoff', () => {
    const [row] = buildResultRows([battle({ id: 'a', winners: [] })], null)
    expect(row.runoff).toBeNull()
    expect(row.noWinner).toBe(true)
  })

  it('an open runoff never shows candidate votes in its line, even if some were sent', () => {
    const [row] = buildResultRows([battle({ id: 'r', runoff: runoffOf('OPEN', [3, 1]) })], null)
    expect(row.runoff?.line).toBe('Runoff in progress: nova vs kay, ends Nov 20')
  })
})

describe('buildResultRows and duels', () => {
  it('drops a duel even though its winners is [] (so "No winner: nobody voted" never shows for one)', () => {
    const rows = buildResultRows(
      [
        battle({ id: 'duel', duel: { outcome: 'DRAW' }, winners: [], submissions: [{ id: 's1' }, { id: 's2' }] }),
        battle({ id: 'regular' }),
      ],
      null,
    )
    expect(rows.map((r) => r.id)).toEqual(['regular'])
  })

  it('drops a duel that is unfinished (null outcome) and one with winners sent by mistake', () => {
    const rows = buildResultRows(
      [
        battle({ id: 'd1', duel: { outcome: null } }),
        battle({ id: 'd2', duel: { outcome: 'CHALLENGER_WON' }, winners: [person('a')], winningVotes: 5 }),
      ],
      null,
    )
    expect(rows).toEqual([])
  })

  it('keeps a battle with duel: null exactly as before', () => {
    const rows = buildResultRows([battle({ id: 'r', duel: null, winners: [person('a')], winningVotes: 7 })], null)
    expect(rows).toHaveLength(1)
    expect(rows[0].winners.map((w) => w.votes)).toEqual([7])
  })

  it('does not offer a type that only has duels in the type filter', () => {
    const types = resultTypes([
      battle({ id: 'd', type: 'Head to Head', duel: { outcome: 'DRAW' } }),
      battle({ id: 'r', type: 'Scratch' }),
    ])
    expect(types).toEqual(['Scratch'])
  })
})

describe('noWinnerText', () => {
  it('says nobody voted when there were entries, and no entries otherwise', () => {
    expect(noWinnerText(3)).toBe('No winner: nobody voted')
    expect(noWinnerText(0)).toBe('No entries')
  })
})

describe('resultTypes', () => {
  it('lists the types of completed battles only, once each', () => {
    expect(
      resultTypes([
        battle({ id: 'a', type: 'Mix' }),
        battle({ id: 'b', type: 'Scratch' }),
        battle({ id: 'c', type: 'Scratch' }),
        battle({ id: 'd', type: 'Routine', status: 'ACTIVE' }),
      ]),
    ).toEqual(expect.arrayContaining(['Mix', 'Scratch']))
    expect(
      resultTypes([battle({ id: 'd', type: 'Routine', status: 'ACTIVE' })]),
    ).toEqual([])
  })
})

describe('groupRowsByMonth', () => {
  it('groups consecutive rows under one month heading, in the order given', () => {
    const rows = buildResultRows(
      [
        battle({ id: 'a', endDate: '2026-11-14T12:00:00Z' }),
        battle({ id: 'b', endDate: '2026-11-02T12:00:00Z' }),
        battle({ id: 'c', endDate: '2026-10-31T12:00:00Z' }),
      ],
      null,
    )
    const groups = groupRowsByMonth(rows)
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ['November 2026', ['a', 'b']],
      ['October 2026', ['c']],
    ])
  })

  it('is empty for no rows', () => {
    expect(groupRowsByMonth([])).toEqual([])
  })
})

describe('paging', () => {
  it('shows 10 results at a time', () => {
    expect(RESULTS_PAGE_SIZE).toBe(10)
  })
})
