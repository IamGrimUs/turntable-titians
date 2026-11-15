import type { Prisma } from '@prisma/client'

export type AuditAction =
  | 'USER_EDIT'
  | 'USER_SUSPEND'
  | 'USER_REINSTATE'
  | 'USER_DELETE'
  | 'EMAIL_BLOCK'
  | 'ROLE_GRANT'
  | 'ROLE_REVOKE'

export interface AuditParty {
  id: string
  username: string | null | undefined
  email: string | undefined
}

// Builds the row for AdminAuditLog. Id, username and email are copied (snapshotted)
// rather than linked, so the entry still reads correctly after either user is deleted.
// The log is append-only: there is deliberately no update or delete helper.
export function auditData(input: {
  actor: AuditParty
  action: AuditAction
  target: AuditParty
  details?: Record<string, unknown>
}): Prisma.AdminAuditLogCreateInput {
  const { actor, action, target, details } = input
  return {
    actorId: actor.id,
    actorUsername: actor.username,
    actorEmail: actor.email ?? '',
    action,
    targetType: 'USER',
    targetId: target.id,
    targetUsername: target.username,
    targetEmail: target.email,
    details: (details ?? {}) as Prisma.InputJsonObject,
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]))
  }
  return Object.is(a, b)
}

// Only the keys whose value changed; arrays (e.g. the crews list) are compared by content.
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!sameValue(before[key], after[key])) {
      changes[key] = { from: before[key], to: after[key] }
    }
  }
  return changes
}
