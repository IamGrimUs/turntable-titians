import { GraphQLError } from 'graphql'
import { db } from './db'
import { cleanCrews, cleanUsername } from './validation'

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

/**
 * The username rules shared by updateProfile and the admin edit. Rules apply only to a value
 * that is actually changing, so an account created before these rules existed can still save
 * its other settings. Returns undefined when no username was supplied.
 */
export async function prepareUsername(
  requested: string | null | undefined,
  current: string | null,
  userId: string
): Promise<string | undefined> {
  if (requested === undefined || requested === null) return undefined
  const trimmed = requested.trim()
  if (trimmed === '') {
    throw new GraphQLError('Username cannot be empty', {
      extensions: { code: 'BAD_USER_INPUT' },
    })
  }
  if (trimmed === current) return trimmed
  const next = cleanUsername(trimmed)
  // Case-insensitive, so "Admin" cannot impersonate "admin".
  const taken = await db.user.findFirst({
    where: { username: { equals: next, mode: 'insensitive' }, NOT: { id: userId } },
    select: { id: true },
  })
  if (taken) {
    throw new GraphQLError('Username already taken', {
      extensions: { code: 'BAD_USER_INPUT' },
    })
  }
  return next
}

/** Crew list rules: validated only when the list differs from the current one. */
export function prepareCrews(
  requested: string[] | null | undefined,
  current: string[]
): string[] | undefined {
  if (requested === undefined || requested === null) return undefined
  return sameList(requested, current) ? requested : cleanCrews(requested)
}
