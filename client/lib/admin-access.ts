/**
 * Who may see the admin area. The role in the session is only a UI and routing hint
 * (it can be up to a few minutes old): the server re-reads the role and any suspension
 * from the database on every API request, so it is the real authority.
 */

export type Role = 'USER' | 'ADMIN' | 'OWNER'

export function isAdminRole(role: unknown): role is 'ADMIN' | 'OWNER' {
  return role === 'ADMIN' || role === 'OWNER'
}

export function canSeeAuditLog(role: unknown): boolean {
  return role === 'OWNER'
}

export type AdminGate = 'allow' | 'sign-in' | 'home'

export function adminGate(user: { id?: string | null; role?: unknown } | null): AdminGate {
  if (!user?.id) return 'sign-in'
  return isAdminRole(user.role) ? 'allow' : 'home'
}

export interface AdminMenuItem {
  key: 'users' | 'audit-log'
  label: string
  href: string
}

export function adminMenuItems(role: Role): AdminMenuItem[] {
  if (!isAdminRole(role)) return []
  const items: AdminMenuItem[] = [{ key: 'users', label: 'Users', href: '/admin/users' }]
  if (canSeeAuditLog(role)) {
    items.push({ key: 'audit-log', label: 'Audit log', href: '/admin/audit-log' })
  }
  return items
}
