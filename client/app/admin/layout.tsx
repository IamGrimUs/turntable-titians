import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { adminGate } from '@/lib/admin-access'
import { isSuspendedNow } from '@/lib/suspension'
import { AdminMenu } from '@/components/admin/AdminMenu'

// Per-user and permission-gated: never prerender or cache any admin page.
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const userId = session?.user?.id

  // The role in the session cookie is only a hint. Read the real role (and any suspension)
  // from the database, the same authority the API uses.
  const user = userId
    ? await db.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, suspendedAt: true, suspendedUntil: true },
      })
    : null

  if (!userId) redirect('/auth/signin?callbackUrl=%2Fadmin')

  // A deleted user or a user suspended right now is refused everywhere by the API, so the
  // admin area does not open for them either.
  if (!user || isSuspendedNow(user)) redirect('/')

  const gate = adminGate({ id: user.id, role: user.role })
  if (gate === 'sign-in') redirect('/auth/signin?callbackUrl=%2Fadmin')
  if (gate === 'home') redirect('/')

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <AdminMenu role={user.role} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
