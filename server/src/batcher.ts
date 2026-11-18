/**
 * A tiny per-request batcher (a minimal DataLoader). Every key asked for in the same tick is
 * loaded with ONE call, so a list of N battles runs one query for all of them instead of N.
 * GraphQL resolves list items in the same tick, so they all land in one batch. Results are
 * cached for the life of the batcher; create one per request.
 */
export function createBatcher<V>(load: (keys: string[]) => Promise<Map<string, V>>) {
  const cache = new Map<string, Promise<V | undefined>>()
  let queue: string[] = []
  let pending: Promise<Map<string, V>> | null = null

  return function get(key: string): Promise<V | undefined> {
    const hit = cache.get(key)
    if (hit) return hit
    if (!pending) {
      queue = []
      pending = Promise.resolve().then(() => {
        const keys = queue
        queue = []
        pending = null
        return load(keys)
      })
    }
    queue.push(key)
    const result = pending.then((values) => values.get(key))
    cache.set(key, result)
    return result
  }
}
