/**
 * Keeps the user's role in the login token (JWT).
 *
 * The role in the token is only a hint for the UI and for routing (showing the admin menu,
 * redirecting non-admins away from /admin). It is re-read from the database at most every
 * five minutes. The server re-reads the role and any suspension from the database on every
 * API request, so it is the real authority and a stale hint cannot grant anything.
 *
 * The same lookup also decides whether the session may continue: a user who is suspended
 * right now, or whose row no longer exists, gets no session (the function returns null,
 * which makes Auth.js clear the cookie). A failed lookup never ends a session.
 */

import type { Role } from './admin-access'
import { isSuspendedNow } from './suspension'

export const ROLE_MAX_AGE_MS = 5 * 60 * 1000

type TokenLike = { id?: unknown; role?: unknown; roleCheckedAt?: unknown; [key: string]: unknown }

export type SessionUserRow = {
  role: Role
  suspendedAt: Date | null
  suspendedUntil: Date | null
}

/** The token with a fresh role, or null when the session must end (suspended or deleted user). */
export async function refreshRoleIntoToken<T extends TokenLike>(
  token: T,
  load: (userId: string) => Promise<SessionUserRow | null>,
  now: number = Date.now(),
  maxAgeMs: number = ROLE_MAX_AGE_MS
): Promise<T | null> {
  if (typeof token.id !== 'string') return token
  const checkedAt = token.roleCheckedAt
  const fresh =
    token.role !== undefined &&
    typeof checkedAt === 'number' &&
    now - checkedAt < maxAgeMs
  if (fresh) return token
  try {
    const row = await load(token.id)
    if (!row || isSuspendedNow(row, new Date(now))) return null
    token.role = row.role
    token.roleCheckedAt = now
  } catch (err) {
    console.error('[session] could not refresh the role into the token', err)
  }
  return token
}
