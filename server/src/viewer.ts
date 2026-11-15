import { db } from './db'
import type { Context } from './context'
import { isSuspended } from './suspension'

/**
 * Loads who the caller is (role, username, email, current suspension) from the database on
 * every request, so a role change or suspension takes effect immediately even though the
 * token lives for an hour. Returns null when the user row no longer exists.
 */
export async function loadViewer(userId: string, now: Date = new Date()): Promise<Omit<Context, 'ip'> | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      username: true,
      email: true,
      suspendedAt: true,
      suspendedUntil: true,
      suspensionReason: true,
    },
  })
  if (!user) return null
  return {
    userId,
    role: user.role,
    username: user.username,
    email: user.email,
    suspension: isSuspended(user, now)
      ? { reason: user.suspensionReason, until: user.suspendedUntil }
      : null,
  }
}
