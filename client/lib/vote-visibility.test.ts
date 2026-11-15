import { describe, it, expect } from 'vitest'
import { rankSubmissions, formatVoteCount, VOTES_HIDDEN_HINT } from './vote-visibility'

const sub = (id: string, voteCount: number | null) => ({ id, voteCount })

describe('rankSubmissions', () => {
  it('keeps the server order and declares no leader or winner while the battle is active', () => {
    // Even if counts somehow arrived, the order and badges must not depend on them.
    const input = [sub('a', 1), sub('b', 9), sub('c', 4)]
    const r = rankSubmissions(input, 'ACTIVE')
    expect(r.ordered.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(r.votesRevealed).toBe(false)
    expect(r.maxVoteCount).toBe(0)
    expect(r.hasWinner).toBe(false)
  })

  it('also keeps the server order before the battle starts', () => {
    const r = rankSubmissions([sub('a', null), sub('b', null)], 'UPCOMING')
    expect(r.ordered.map((s) => s.id)).toEqual(['a', 'b'])
    expect(r.votesRevealed).toBe(false)
  })

  it('ranks by votes, highest first, once the battle is completed', () => {
    const r = rankSubmissions([sub('a', 1), sub('b', 9), sub('c', 4)], 'COMPLETED')
    expect(r.ordered.map((s) => s.id)).toEqual(['b', 'c', 'a'])
    expect(r.votesRevealed).toBe(true)
    expect(r.maxVoteCount).toBe(9)
    expect(r.hasWinner).toBe(true)
  })

  it('keeps ties in the server order (oldest first)', () => {
    const r = rankSubmissions([sub('a', 3), sub('b', 3), sub('c', 1)], 'COMPLETED')
    expect(r.ordered.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('has no winner when a completed battle got no votes', () => {
    const r = rankSubmissions([sub('a', 0), sub('b', 0)], 'COMPLETED')
    expect(r.hasWinner).toBe(false)
  })

  it('copes with an empty battle and with missing counts', () => {
    expect(rankSubmissions([], 'COMPLETED').ordered).toEqual([])
    expect(rankSubmissions([sub('a', null)], 'COMPLETED').maxVoteCount).toBe(0)
  })

  it('does not change the array it is given', () => {
    const input = [sub('a', 1), sub('b', 9)]
    rankSubmissions(input, 'COMPLETED')
    expect(input.map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('formatVoteCount', () => {
  it('shows a deliberate "hidden" state, not a blank, when the count is withheld', () => {
    expect(formatVoteCount(null)).toEqual({ hidden: true, text: 'vote count hidden', hint: VOTES_HIDDEN_HINT })
  })

  it('shows the number when it is known, including zero', () => {
    expect(formatVoteCount(12)).toEqual({ hidden: false, text: '12' })
    expect(formatVoteCount(0)).toEqual({ hidden: false, text: '0' })
  })

  it('explains why the count is hidden', () => {
    expect(VOTES_HIDDEN_HINT).toMatch(/hidden until the battle ends/i)
  })
})
