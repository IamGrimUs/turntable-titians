import { LIMITS, USERNAME_PATTERN } from './validation'

export const SEARCH_LIMITS = { minChars: 2, maxResults: 8 } as const

/**
 * The text to search usernames for, or null meaning "return nothing".
 *
 * Only characters a username can hold are allowed, so `%`, spaces, control
 * characters and emoji can never reach the database. `_` is a database LIKE
 * wildcard and is allowed in usernames, so `a_b` may also match `axb`; that is
 * harmless for suggestions.
 */
export function cleanSearchText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let text = raw.trim()
  if (text.startsWith('@')) text = text.slice(1)
  if (text.length < SEARCH_LIMITS.minChars) return null
  if (text.length > LIMITS.usernameMax) return null
  if (!USERNAME_PATTERN.test(text)) return null
  return text
}
