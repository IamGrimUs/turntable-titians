import { cache } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { adminGate, type Role } from '@/lib/admin-access'
import { isSuspendedNow } from '@/lib/suspension'

/**
 * The signed-in user's row, read from the database. Wrapped in React's `cache()` so the layout and
 * the page, which both run the gate on a hard load, share one lookup per request. Only this
 * lookup (plain data, no arguments) is cached: the `redirect()` calls stay outside it, so they
 * always run in the caller. `cache()` is a per-request memo on the server and a plain call
 * elsewhere (such as the unit tests), so a result is never shared between requests or users.
 */
const loadSignedInUser = cache(async () => {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { userId: null, user: null }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, suspendedAt: true, suspendedUntil: true },
  })
  return { userId, user }
})

/**
 * The signed-in admin, read from the database. Redirects (never returns) for anyone who may not
 * use the admin area: signed out, deleted, suspended right now, or not an admin.
 *
 * The role in the session cookie is only a hint, so it is not used. Layouts do not re-run on
 * soft navigation, so every admin page repeats this check itself instead of relying on the layout;
 * on a hard load the layout and the page share one database lookup through `cache()`.
 */
export async function requireAdminViewer(): Promise<{ id: string; role: Role }> {
  const { userId, user } = await loadSignedInUser()

  if (!userId) redirect('/auth/signin?callbackUrl=%2Fadmin')

  // A deleted user or a user suspended right now is refused everywhere by the API, so the
  // admin area does not open for them either.
  if (!user || isSuspendedNow(user)) redirect('/')

  const gate = adminGate({ id: user.id, role: user.role })
  if (gate === 'sign-in') redirect('/auth/signin?callbackUrl=%2Fadmin')
  if (gate === 'home') redirect('/')

  return { id: user.id, role: user.role }
}
