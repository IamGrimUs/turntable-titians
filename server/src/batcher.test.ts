import { describe, it, expect, vi } from 'vitest'
import { createBatcher } from './batcher'

describe('createBatcher', () => {
  it('runs one load for every key asked for in the same tick', async () => {
    const load = vi.fn(async (keys: string[]) => new Map(keys.map((k) => [k, k.toUpperCase()])))
    const get = createBatcher(load)
    const results = await Promise.all([get('a'), get('b'), get('c')])
    expect(results).toEqual(['A', 'B', 'C'])
    expect(load).toHaveBeenCalledTimes(1)
    expect(load.mock.calls[0][0]).toEqual(['a', 'b', 'c'])
  })

  it('returns undefined for a key the load did not return', async () => {
    const get = createBatcher(async () => new Map<string, string>())
    expect(await get('missing')).toBeUndefined()
  })

  it('answers a repeated key from the cache without loading again', async () => {
    const load = vi.fn(async (keys: string[]) => new Map(keys.map((k) => [k, 1])))
    const get = createBatcher(load)
    await get('a')
    await get('a')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('starts a new batch for keys asked for in a later tick', async () => {
    const load = vi.fn(async (keys: string[]) => new Map(keys.map((k) => [k, k])))
    const get = createBatcher(load)
    await get('a')
    await get('b')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('rejects every waiting key when the load fails', async () => {
    const get = createBatcher(async () => {
      throw new Error('db down')
    })
    const settled = await Promise.allSettled([get('a'), get('b')])
    expect(settled.map((s) => s.status)).toEqual(['rejected', 'rejected'])
  })
})
