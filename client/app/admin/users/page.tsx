import { requireAdminViewer } from '@/lib/admin-viewer'
import { UsersView } from '@/components/admin/UsersView'

// Per-user and permission-gated: never prerender or cache.
export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  // Layouts do not re-run on soft navigation, so this page checks for itself, against the
  // database (not the session hint), and hands the database role to the client view.
  const viewer = await requireAdminViewer()

  return <UsersView viewerRole={viewer.role} />
}
