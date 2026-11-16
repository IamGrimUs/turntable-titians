import { describe, it, expect } from 'vitest'
import { winnersOfBattle } from './battleResults'

describe('winnersOfBattle', () => {
  it('picks the entry with the most votes', () => {
    expect([...winnersOfBattle([{ userId: 'a', votes: 3 }, { userId: 'b', votes: 5 }, { userId: 'c', votes: 1 }])]).toEqual(['b'])
  })

  it('has no winner when nobody got a vote', () => {
    expect(winnersOfBattle([{ userId: 'a', votes: 0 }, { userId: 'b', votes: 0 }]).size).toBe(0)
  })

  it('has no winner for an empty battle', () => {
    expect(winnersOfBattle([]).size).toBe(0)
  })

  it('awards every tied user at the top', () => {
    expect([...winnersOfBattle([{ userId: 'a', votes: 4 }, { userId: 'b', votes: 4 }, { userId: 'c', votes: 2 }])].sort()).toEqual(['a', 'b'])
  })

  it('counts a user once when several of their entries tie for the top', () => {
    const winners = winnersOfBattle([{ userId: 'a', votes: 4 }, { userId: 'a', votes: 4 }])
    expect(winners.size).toBe(1)
    expect(winners.has('a')).toBe(true)
  })

  it('does not modify its input', () => {
    const entries = [{ userId: 'a', votes: 1 }]
    winnersOfBattle(entries)
    expect(entries).toEqual([{ userId: 'a', votes: 1 }])
  })
})
