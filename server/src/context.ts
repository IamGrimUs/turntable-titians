import { GraphQLError } from 'graphql'
import { assertCan, type Actor, type AdminAction, type Role, type Target } from './permissions'

/**
 * Per-request context. Everything except `userId` is optional: anonymous callers have only
 * `userId: null`, and a context without `suspension` counts as not suspended.
 */
export interface Context {
  userId: string | null
  ip?: string | null
  role?: Role
  suspension?: { reason: string | null; until: Date | null } | null
  username?: string | null
  email?: string
}

/** The error a suspended caller gets, with the reason when there is one. Shared by requireAuth and the suspension backstop. */
export function suspendedError(suspension: NonNullable<Context['suspension']>): GraphQLError {
  const reason = suspension.reason
  return new GraphQLError(reason ? `Your account is suspended. Reason: ${reason}` : 'Your account is suspended.', {
    extensions: { code: 'FORBIDDEN' },
  })
}

/**
 * Returns the signed-in user's id. Anonymous callers get UNAUTHENTICATED; a suspended caller
 * gets FORBIDDEN, so every mutation that goes through here is blocked while suspended.
 */
export function requireAuth(ctx: Context): string {
  if (!ctx.userId) {
    throw new GraphQLError('Not authenticated', {
      extensions: { code: 'UNAUTHENTICATED' },
    })
  }
  if (ctx.suspension) throw suspendedError(ctx.suspension)
  return ctx.userId
}

/**
 * Signed in, not suspended, and allowed to do `action`. Going through requireAuth first means
 * a suspended admin who still holds a valid token loses admin powers too.
 */
export function requireAdmin(ctx: Context, action: AdminAction, target?: Target): Actor {
  const id = requireAuth(ctx)
  const actor: Actor = { id, role: ctx.role ?? 'USER' }
  assertCan(actor, action, target)
  return actor
}
