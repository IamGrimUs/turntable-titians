import { requireAdmin, type Context } from './context'
import { loadAdminUserRows } from './adminData'
import { queryAdminUsers, type UserFilter, type UserSortKey } from './adminUserQuery'

export interface AdminUsersArgs {
  search?: string | null
  filter?: UserFilter
  sortKey?: UserSortKey
  sortDir?: 'ASC' | 'DESC'
  page?: number
  pageSize?: number
}

export const adminQuery = {
  adminUsers: async (_: unknown, args: AdminUsersArgs, ctx: Context) => {
    // The permission check comes first: nothing reaches the database for a non-admin.
    requireAdmin(ctx, 'viewAdmin')
    const rows = await loadAdminUserRows()
    return queryAdminUsers(rows, args)
  },
}

/** Admin mutations are added here by later tasks. */
export const adminMutation: Record<string, never> = {}

export const AdminUser = {
  createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
  lastSignInAt: (parent: { lastSignInAt: Date }) => parent.lastSignInAt.toISOString(),
  suspendedUntil: (parent: { suspendedUntil: Date | null }) => parent.suspendedUntil?.toISOString() ?? null,
}
