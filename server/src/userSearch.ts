import { db } from './db'
import { LIMITS, USERNAME_PATTERN } from './validation'

export const SEARCH_LIMITS = { minChars: 2, maxResults: 8 } as const

/**
 * The text to search usernames for, or null meaning "return nothing".
 *
 * Only characters a username can hold are allowed, so `%`, spaces, control
 * characters and emoji can never reach the database. `%` and `\` (the other LIKE
 * characters) are rejected here. `_` is a valid username character and a LIKE
 * wildcard; Prisma does not escape it, so searchUsers escapes it when it builds
 * the pattern. The text returned here is the clean, unescaped text.
 */
export function cleanSearchText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let text = raw.trim()
  if (text.startsWith('@')) text = text.slice(1).trim()
  if (text.length < SEARCH_LIMITS.minChars) return null
  if (text.length > LIMITS.usernameMax) return null
  if (!USERNAME_PATTERN.test(text)) return null
  return text
}

export interface UserSearchResult {
  id: string
  username: string
  image: string | null
  crew: string | null
}

// Only these columns are read, so nothing private can reach the response by accident.
const SEARCH_SELECT = { id: true, username: true, image: true, externalCrews: true } as const

/**
 * DJs whose username starts with the text first, then those that merely contain it, at most
 * SEARCH_LIMITS.maxResults in all. Public and open to signed-out callers; it returns a small
 * dedicated shape, never `User`. At most two queries, however many rows come back.
 */
async function searchUsers(_: unknown, args: { query: string }): Promise<UserSearchResult[]> {
  const text = cleanSearchText(args.query)
  if (text === null) return []
  // Prisma does not escape LIKE wildcards, so a literal `_` must be escaped here. `%` and `\`
  // cannot occur: cleanSearchText rejects them.
  const pattern = text.replace(/_/g, '\\_')

  // Negation of "suspended now" (suspension.ts): never suspended, or the suspension has ended.
  // A null username never matches a text filter, so unnamed accounts are never listed.
  const now = new Date()
  const notSuspended = { OR: [{ suspendedAt: null }, { suspendedUntil: { lte: now } }] }
  const max = SEARCH_LIMITS.maxResults

  const prefix = await db.user.findMany({
    where: { username: { startsWith: pattern, mode: 'insensitive' }, ...notSuspended },
    orderBy: { username: 'asc' },
    take: max,
    select: SEARCH_SELECT,
  })

  let rows = prefix
  if (prefix.length < max) {
    const contains = await db.user.findMany({
      where: {
        username: { contains: pattern, mode: 'insensitive' },
        id: { notIn: prefix.map((u) => u.id) },
        ...notSuspended,
      },
      orderBy: { username: 'asc' },
      take: max - prefix.length,
      select: SEARCH_SELECT,
    })
    rows = [...prefix, ...contains]
  }

  const results: UserSearchResult[] = []
  for (const u of rows) {
    if (u.username === null) continue
    results.push({ id: u.id, username: u.username, image: u.image, crew: u.externalCrews[0] ?? null })
  }
  return results
}

export const userSearchQuery = { searchUsers }
