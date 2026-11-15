import { auth } from '@/auth'
import { db } from '@/lib/db'
import { isActiveUser } from '@/lib/suspension'

/**
 * The signed-in user's id, but only if that user still exists and is not suspended right now;
 * otherwise null. Route handlers use it instead of reading the session directly, because a
 * session can outlive the account (up to its 30-day lifetime) while the user is suspended or
 * deleted. The database is the authority, read on every call.
 */
export async function activeSessionUserId(): Promise<string | null> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return null
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { suspendedAt: true, suspendedUntil: true },
  })
  return isActiveUser(row) ? userId : null
}
