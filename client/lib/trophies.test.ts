import { describe, expect, it } from 'vitest'
import { buildTrophyShelf, ordinal, type RecordInput } from './trophies'

const record = (over: Partial<RecordInput> = {}): RecordInput => ({
  wins: 0,
  podiums: 0,
  bestFinish: null,
  currentStreak: 0,
  bestStreak: 0,
  battlesEntered: 0,
  ...over,
})

const stat = (shelf: ReturnType<typeof buildTrophyShelf>, label: string) =>
  shelf.stats.find((s) => s.label === label)?.value

describe('ordinal', () => {
  it('writes places the way people say them', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th',
    ])
  })
})

describe('buildTrophyShelf stats', () => {
  it('shows zeros and dashes for someone with no results, never blanks', () => {
    const shelf = buildTrophyShelf(record())
    expect(shelf.stats.map((s) => [s.label, s.value])).toEqual([
      ['Podium finishes', '0'],
      ['Best finish', '–'],
      ['Win streak', '0'],
      ['Best streak', '0'],
      ['Win rate', '–'],
    ])
  })

  it('treats a missing record as no results', () => {
    expect(buildTrophyShelf(null)).toEqual(buildTrophyShelf(record()))
    expect(buildTrophyShelf(undefined)).toEqual(buildTrophyShelf(record()))
  })

  it('shows the numbers from the record', () => {
    const shelf = buildTrophyShelf(
      record({ wins: 7, podiums: 9, bestFinish: 1, currentStreak: 2, bestStreak: 4, battlesEntered: 12 }),
    )
    expect(stat(shelf, 'Podium finishes')).toBe('9')
    expect(stat(shelf, 'Best finish')).toBe('1st')
    expect(stat(shelf, 'Win streak')).toBe('2')
    expect(stat(shelf, 'Best streak')).toBe('4')
    expect(stat(shelf, 'Win rate')).toBe('58%')
  })

  it('shows a best finish below the podium too', () => {
    expect(stat(buildTrophyShelf(record({ bestFinish: 5, battlesEntered: 2 })), 'Best finish')).toBe('5th')
  })
})

describe('buildTrophyShelf milestones', () => {
  const earned = (shelf: ReturnType<typeof buildTrophyShelf>) =>
    shelf.milestones.filter((m) => m.earned).map((m) => m.id)

  it('lists all four, in a fixed order, all locked for a newcomer', () => {
    const shelf = buildTrophyShelf(record())
    expect(shelf.milestones.map((m) => m.id)).toEqual(['first-win', 'three-wins', 'ten-wins', 'first-podium'])
    expect(earned(shelf)).toEqual([])
    expect(shelf.earnedCount).toBe(0)
  })

  it('every milestone says how to earn it, so locked ones are something to chase', () => {
    for (const m of buildTrophyShelf(record()).milestones) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(m.hint.length).toBeGreaterThan(0)
    }
  })

  it('earns First win at 1 win, 3 wins at 3, 10 wins at 10', () => {
    expect(earned(buildTrophyShelf(record({ wins: 1 })))).toEqual(['first-win'])
    expect(earned(buildTrophyShelf(record({ wins: 2 })))).toEqual(['first-win'])
    expect(earned(buildTrophyShelf(record({ wins: 3 })))).toEqual(['first-win', 'three-wins'])
    expect(earned(buildTrophyShelf(record({ wins: 10 })))).toEqual(['first-win', 'three-wins', 'ten-wins'])
  })

  it('earns First podium on a top-three finish without needing a win', () => {
    expect(earned(buildTrophyShelf(record({ podiums: 1, bestFinish: 3 })))).toEqual(['first-podium'])
  })

  it('counts the earned ones', () => {
    expect(buildTrophyShelf(record({ wins: 3, podiums: 3, bestFinish: 1 })).earnedCount).toBe(3)
  })
})
