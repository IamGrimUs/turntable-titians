import { requireAdminViewer } from '@/lib/admin-viewer'
import { AdminMenu } from '@/components/admin/AdminMenu'

// Per-user and permission-gated: never prerender or cache any admin page.
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminViewer()

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <AdminMenu role={user.role} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
