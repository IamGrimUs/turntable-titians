import { redirect } from 'next/navigation'
import { canSeeAuditLog } from '@/lib/admin-access'
import { requireAdminViewer } from '@/lib/admin-viewer'
import { AuditLogTable } from '@/components/admin/AuditLogTable'

// Per-user and permission-gated: never prerender or cache.
export const dynamic = 'force-dynamic'

export default async function AdminAuditLogPage() {
  // Layouts do not re-run on soft navigation, so this page checks for itself, against the
  // database (not the session hint). Only the owner may read the log; the API enforces it too.
  const viewer = await requireAdminViewer()
  if (!canSeeAuditLog(viewer.role)) redirect('/admin/users')

  return <AuditLogTable />
}
