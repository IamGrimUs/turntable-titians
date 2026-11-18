import { describe, expect, it } from 'vitest'
import { battleCardView, type CardBattle } from './battle-card-view'

const person = (id: string, username: string | null = id) => ({ id, username, name: null, image: null })

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

const battle = (over: Partial<CardBattle>): CardBattle => ({
  status: 'COMPLETED',
  winners: [],
  runoff: null,
  ...over,
})

describe('battleCardView', () => {
  it('a card without a runoff is exactly as before', () => {
    expect(battleCardView(battle({ status: 'ACTIVE' }))).toEqual({
      statusLabel: 'ACTIVE',
      statusVariant: 'active',
      winnerLine: null,
      runoffLine: null,
    })
    expect(battleCardView(battle({ status: 'UPCOMING' })).statusVariant).toBe('upcoming')
    expect(battleCardView(battle({ winners: [person('a', 'ann')] }))).toEqual({
      statusLabel: 'COMPLETED',
      statusVariant: 'completed',
      winnerLine: 'Won by ann',
      runoffLine: null,
    })
    expect(battleCardView(battle({ winners: [person('a', 'ann'), person('b', 'bob')] })).winnerLine).toBe('Tied: ann and bob')
    expect(battleCardView(battle({ winners: [] })).winnerLine).toBeNull()
  })

  it('an open runoff shows an amber Runoff pill and the in-progress line, with no winner line', () => {
    const view = battleCardView(battle({ runoff: runoffOf('OPEN', [null, null]) }))
    expect(view.statusLabel).toBe('RUNOFF')
    expect(view.statusVariant).toBe('runoff')
    expect(view.runoffLine).toEqual({ text: 'Runoff in progress: nova vs kay, ends Nov 20', crown: false })
    expect(view.winnerLine).toBeNull()
  })

  it('a decided runoff reads Completed with the crown line, not the round-one winner line', () => {
    const view = battleCardView(battle({ winners: [person('k', 'kay')], runoff: runoffOf('DECIDED', [24, 31]) }))
    expect(view.statusLabel).toBe('COMPLETED')
    expect(view.statusVariant).toBe('completed')
    expect(view.runoffLine).toEqual({ text: 'Won by kay (runoff, 31 to 24)', crown: true })
    expect(view.winnerLine).toBeNull()
  })

  it('a runoff that ended level reads Completed with the tied crown line', () => {
    const view = battleCardView(
      battle({ winners: [person('n', 'nova'), person('k', 'kay')], runoff: runoffOf('TIED', [5, 5]) }),
    )
    expect(view.statusLabel).toBe('COMPLETED')
    expect(view.runoffLine).toEqual({ text: 'Tied: nova and kay (runoff level)', crown: true })
  })

  it('ignores a runoff on a battle that is not completed', () => {
    const view = battleCardView(battle({ status: 'ACTIVE', runoff: runoffOf('OPEN', [null, null]) }))
    expect(view.statusLabel).toBe('ACTIVE')
    expect(view.runoffLine).toBeNull()
  })

  it('treats a missing winners or runoff list as none', () => {
    expect(battleCardView({ status: 'COMPLETED', winners: null, runoff: undefined }).winnerLine).toBeNull()
  })
})
