/**
 * Keeps the user's role in the login token (JWT).
 *
 * The role in the token is only a hint for the UI and for routing (showing the admin menu,
 * redirecting non-admins away from /admin). It is re-read from the database at most every
 * five minutes. The server re-reads the role and any suspension from the database on every
 * API request, so it is the real authority and a stale hint cannot grant anything.
 */

import type { Role } from './admin-access'

export const ROLE_MAX_AGE_MS = 5 * 60 * 1000

type TokenLike = { id?: unknown; role?: unknown; roleCheckedAt?: unknown; [key: string]: unknown }

export async function refreshRoleIntoToken<T extends TokenLike>(
  token: T,
  load: (userId: string) => Promise<{ role: Role } | null>,
  now: number = Date.now(),
  maxAgeMs: number = ROLE_MAX_AGE_MS
): Promise<T> {
  if (typeof token.id !== 'string') return token
  const checkedAt = token.roleCheckedAt
  const fresh =
    token.role !== undefined &&
    typeof checkedAt === 'number' &&
    now - checkedAt < maxAgeMs
  if (fresh) return token
  try {
    const row = await load(token.id)
    token.role = row ? row.role : 'USER'
    token.roleCheckedAt = now
  } catch (err) {
    console.error('[session] could not refresh the role into the token', err)
  }
  return token
}
