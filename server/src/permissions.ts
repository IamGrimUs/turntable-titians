import { GraphQLError } from 'graphql'

export type Role = 'USER' | 'ADMIN' | 'OWNER'

export type AdminAction = 'viewAdmin' | 'manageUser' | 'setRole' | 'viewAuditLog'

export interface Actor {
  id: string
  role: Role
}

export interface Target {
  id: string
  role: Role
}

/**
 * Pure permission rules for the admin portal. Resolvers ask "can this caller do X?" here
 * and never compare role names inline.
 *
 * - viewAdmin: ADMIN and OWNER.
 * - manageUser (edit, suspend, reinstate, delete): ADMIN may act on a USER; OWNER may act
 *   on a USER or an ADMIN. Nobody can act on the OWNER from the portal. This also means an
 *   admin cannot act on themselves.
 * - setRole (make or remove an ADMIN): OWNER only, on a USER or an ADMIN.
 * - viewAuditLog: OWNER only.
 *
 * A missing actor or (for target actions) a missing target is always denied.
 */
export function can(actor: Actor | null, action: AdminAction, target?: Target): boolean {
  if (!actor) return false

  switch (action) {
    case 'viewAdmin':
      return actor.role === 'ADMIN' || actor.role === 'OWNER'
    case 'manageUser':
      if (!target) return false
      if (actor.role === 'OWNER') return target.role === 'USER' || target.role === 'ADMIN'
      if (actor.role === 'ADMIN') return target.role === 'USER'
      return false
    case 'setRole':
      if (!target) return false
      return actor.role === 'OWNER' && (target.role === 'USER' || target.role === 'ADMIN')
    case 'viewAuditLog':
      return actor.role === 'OWNER'
    default:
      return false
  }
}

export function assertCan(actor: Actor | null, action: AdminAction, target?: Target): void {
  if (!can(actor, action, target)) {
    throw new GraphQLError("You don't have permission to do that.", {
      extensions: { code: 'FORBIDDEN' },
    })
  }
}
