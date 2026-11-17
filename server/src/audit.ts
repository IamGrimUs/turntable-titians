import type { Prisma } from '@prisma/client'

export type AuditAction =
  | 'USER_EDIT'
  | 'USER_SUSPEND'
  | 'USER_REINSTATE'
  | 'USER_DELETE'
  | 'EMAIL_BLOCK'
  | 'ROLE_GRANT'
  | 'ROLE_REVOKE'
  | 'IDEA_STATUS'
  | 'IDEA_HIDE'
  | 'IDEA_UNHIDE'
  | 'IDEA_DELETE'
  | 'COMMENT_HIDE'
  | 'COMMENT_UNHIDE'
  | 'COMMENT_DELETE'

export interface AuditParty {
  id: string
  username: string | null | undefined
  email: string | undefined
}

// Builds the row for AdminAuditLog. Id, username and email are copied (snapshotted)
// rather than linked, so the entry still reads correctly after either user is deleted.
// The log is append-only: there is deliberately no update or delete helper.
// `target` is always a person (for board moderation, the content's author); `targetType` and
// `targetId` default to that user and only differ when the thing acted on is an idea or comment.
export function auditData(input: {
  actor: AuditParty
  action: AuditAction
  target: AuditParty
  details?: Record<string, unknown>
  targetType?: 'USER' | 'IDEA' | 'COMMENT'
  targetId?: string
}): Prisma.AdminAuditLogCreateInput {
  const { actor, action, target, details, targetType = 'USER', targetId = target.id } = input
  // User.email is never null, so a missing one is a loader bug. Fail closed: this runs inside
  // the same transaction as the change, so throwing rolls the action back instead of writing
  // a blank snapshot into an append-only log.
  if (!actor.email) throw new Error('audit: actor email missing')
  return {
    actorId: actor.id,
    actorUsername: actor.username,
    actorEmail: actor.email,
    action,
    targetType,
    targetId,
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
// A key whose `after` value is undefined is skipped: not supplied is not the same as cleared
// (clearing is null). A key with a defined `after` value but missing in `before` is reported
// with from: undefined.
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (after[key] === undefined) continue
    if (!sameValue(before[key], after[key])) {
      changes[key] = { from: before[key], to: after[key] }
    }
  }
  return changes
}
