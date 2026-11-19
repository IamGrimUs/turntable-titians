/**
 * Pure logic for finding a DJ by username: the text rules, which state the results
 * list is in, the latest-request gate and keyboard highlighting. Kept free of React so
 * it can be unit-tested; the picker and the navigation search panel consume it.
 */
import { plural } from './plural'

export interface UserSearchResult {
  id: string
  username: string
  image: string | null
  crew: string | null
}

/**
 * `minChars` mirrors `SEARCH_LIMITS.minChars` in server/src/userSearch.ts and `maxChars`
 * mirrors `LIMITS.usernameMax` in server/src/validation.ts. The client and server share no
 * code, so `user-search.test.ts` pins both by hand-reading those files.
 */
export const SEARCH_LIMITS = { minChars: 2, maxChars: 30, debounceMs: 250 } as const

// C0 and C1 control characters, including DEL.
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g

/** The text to search for: no control characters, one leading `@` dropped, trimmed, capped. */
export function searchText(raw: string): string {
  const withoutControls = raw.replace(CONTROL_CHARACTERS, '').trim()
  const withoutAt = withoutControls.startsWith('@') ? withoutControls.slice(1) : withoutControls
  return withoutAt.trim().slice(0, SEARCH_LIMITS.maxChars)
}

export function isSearchable(text: string): boolean {
  return text.length >= SEARCH_LIMITS.minChars
}

export type SearchViewState = 'idle' | 'loading' | 'error' | 'empty' | 'results'

export function searchViewState(i: {
  text: string
  loading: boolean
  failed: boolean
  results: readonly UserSearchResult[]
}): SearchViewState {
  if (!isSearchable(i.text)) return 'idle'
  if (i.loading) return 'loading'
  if (i.failed) return 'error'
  return i.results.length === 0 ? 'empty' : 'results'
}

/**
 * Lets only the newest request apply its answer: call `next()` when a request starts and
 * check `isLatest(token)` when its response arrives, so a slow older answer is ignored.
 */
export function createLatestGate(): { next(): number; isLatest(token: number): boolean } {
  let latest = 0
  return {
    next: () => ++latest,
    isLatest: (token) => token === latest,
  }
}

/** The next highlighted row. `-1` means nothing is highlighted; the move wraps around. */
export function moveActive(index: number, key: 'ArrowDown' | 'ArrowUp', count: number): number {
  if (count <= 0) return -1
  if (key === 'ArrowDown') return index < 0 || index >= count - 1 ? 0 : index + 1
  return index <= 0 || index >= count ? count - 1 : index - 1
}

/** The polite live-region message for a finished search. */
export function resultsAnnouncement(count: number): string {
  return count === 0 ? 'No DJs found' : `${plural(count, 'DJ')} found`
}
