import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./standings', () => ({
  loadOutcomesByBattle: vi.fn(),
  loadHallOfFame: vi.fn(),
  loadUserRecord: vi.fn(),
}))

import { loadOutcomesByBattle, loadHallOfFame, loadUserRecord } from './standings'
import { battleWinners, battleWinningVotes, standingsQuery, userRecord } from './standingsResolvers'

const winnersLoad = loadOutcomesByBattle as unknown as ReturnType<typeof vi.fn>
const hallLoad = loadHallOfFame as unknown as ReturnType<typeof vi.fn>
const recordLoad = loadUserRecord as unknown as ReturnType<typeof vi.fn>

const day = 24 * 3600 * 1000
const ended = (id: string) => ({ id, startDate: new Date(Date.now() - 20 * day), endDate: new Date(Date.now() - 10 * day) }) as never
const active = (id: string) => ({ id, startDate: new Date(Date.now() - 2 * day), endDate: new Date(Date.now() + 2 * day) }) as never
const upcoming = (id: string) => ({ id, startDate: new Date(Date.now() + 5 * day), endDate: new Date(Date.now() + 15 * day) }) as never

beforeEach(() => vi.resetAllMocks())

describe('Battle.winners', () => {
  it('is empty for an active or upcoming battle and never reads standings', async () => {
    expect(await battleWinners(active('b1'), {}, { userId: null })).toEqual([])
    expect(await battleWinners(upcoming('b2'), {}, { userId: null })).toEqual([])
    expect(winnersLoad).not.toHaveBeenCalled()
  })

  it('returns the winners of a completed battle', async () => {
    winnersLoad.mockResolvedValue(new Map([['b1', { winners: [{ id: 'u1' }], winningVotes: 4 }]]))
    expect(await battleWinners(ended('b1'), {}, { userId: null })).toEqual([{ id: 'u1' }])
  })

  it('is empty for a completed battle the loader has no winners for', async () => {
    winnersLoad.mockResolvedValue(new Map())
    expect(await battleWinners(ended('b1'), {}, { userId: null })).toEqual([])
  })

  it('loads every battle of one request together, in a single batch', async () => {
    winnersLoad.mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, { winners: [{ id: `w-${id}` }], winningVotes: 1 }])))
    const ctx = { userId: null }
    const lists = await Promise.all([ended('b1'), ended('b2'), ended('b3')].map((b) => battleWinners(b, {}, ctx)))
    expect(lists).toEqual([[{ id: 'w-b1' }], [{ id: 'w-b2' }], [{ id: 'w-b3' }]])
    expect(winnersLoad).toHaveBeenCalledTimes(1)
    expect(winnersLoad.mock.calls[0][0]).toEqual(['b1', 'b2', 'b3'])
  })

  it('does not share results between two requests', async () => {
    winnersLoad.mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, { winners: [], winningVotes: null }])))
    await battleWinners(ended('b1'), {}, { userId: null })
    await battleWinners(ended('b1'), {}, { userId: null })
    expect(winnersLoad).toHaveBeenCalledTimes(2)
  })

  it('still works when called without a context', async () => {
    winnersLoad.mockResolvedValue(new Map([['b1', { winners: [{ id: 'u1' }], winningVotes: 4 }]]))
    expect(await battleWinners(ended('b1'), {}, undefined)).toEqual([{ id: 'u1' }])
  })
})

describe('Battle.winningVotes', () => {
  it('is null for an open battle and never reads standings', async () => {
    expect(await battleWinningVotes(active('b1'), {}, { userId: null })).toBeNull()
    expect(winnersLoad).not.toHaveBeenCalled()
  })

  it('is the winning entry total for a completed battle', async () => {
    winnersLoad.mockResolvedValue(new Map([['b1', { winners: [{ id: 'u1' }], winningVotes: 4 }]]))
    expect(await battleWinningVotes(ended('b1'), {}, { userId: null })).toBe(4)
  })

  it('is null when nobody won', async () => {
    winnersLoad.mockResolvedValue(new Map([['b1', { winners: [], winningVotes: null }]]))
    expect(await battleWinningVotes(ended('b1'), {}, { userId: null })).toBeNull()
  })

  it('shares one batch with Battle.winners within a request', async () => {
    winnersLoad.mockImplementation(async (ids: string[]) =>
      new Map(ids.map((id) => [id, { winners: [{ id: 'u1' }], winningVotes: 3 }])))
    const ctx = { userId: null }
    await Promise.all([battleWinners(ended('b1'), {}, ctx), battleWinningVotes(ended('b1'), {}, ctx)])
    expect(winnersLoad).toHaveBeenCalledTimes(1)
  })
})

describe('Query.hallOfFame and User.record', () => {
  it('hallOfFame returns the loaded champions', async () => {
    hallLoad.mockResolvedValue([{ rank: 1 }])
    expect(await standingsQuery.hallOfFame()).toEqual([{ rank: 1 }])
  })

  it('User.record loads the record of that user', async () => {
    recordLoad.mockResolvedValue({ wins: 2 })
    expect(await userRecord({ id: 'u9' })).toEqual({ wins: 2 })
    expect(recordLoad).toHaveBeenCalledWith('u9')
  })
})
