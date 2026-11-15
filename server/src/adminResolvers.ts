import { GraphQLError } from 'graphql'
import { db } from './db'
import { requireAdmin, type Context } from './context'
import { auditData, diffFields } from './audit'
import { cleanSuspension, isSuspended } from './suspension'
import { prepareCrews, prepareUsername } from './profileRules'
import { LIMITS, cleanSingleLine } from './validation'
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

export interface AdminUpdateUserArgs {
  userId: string
  username?: string | null
  name?: string | null
  externalCrews?: string[] | null
  removeAvatar?: boolean | null
}

export interface AdminDeleteUserArgs {
  userId: string
  blockEmail?: boolean | null
}

export interface AdminSuspendUserArgs {
  userId: string
  reason: string
  until?: string | null
}

const suspensionTargetSelect = {
  id: true,
  role: true,
  username: true,
  email: true,
  suspendedAt: true,
  suspendedUntil: true,
  suspensionReason: true,
} as const

async function loadSuspensionTarget(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: suspensionTargetSelect })
  if (!user) {
    throw new GraphQLError('User not found', { extensions: { code: 'NOT_FOUND' } })
  }
  return user
}


/** Admin mutations; each later task adds its own to this object. */
export const adminMutation = {
  adminUpdateUser: async (_: unknown, args: AdminUpdateUserArgs, ctx: Context) => {
    const { userId, username, name, externalCrews, removeAvatar } = args

    // Access check first: nothing reaches the database for a non-admin, and a caller who is not
    // allowed in cannot learn whether a user id exists. The target-aware check follows the load.
    requireAdmin(ctx, 'viewAdmin')

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, username: true, name: true, image: true, externalCrews: true, email: true },
    })
    if (!user) {
      throw new GraphQLError('User not found', { extensions: { code: 'NOT_FOUND' } })
    }
    const actor = requireAdmin(ctx, 'manageUser', { id: user.id, role: user.role })

    // Validate everything before any write. Only supplied fields end up in `after`.
    const nextUsername = await prepareUsername(username, user.username, user.id)
    // An empty or blank name means "clear it".
    const cleanedName =
      name === undefined || name === null
        ? undefined
        : (cleanSingleLine(name, 'Name', { max: LIMITS.displayName }) ?? null)
    const nextCrews = prepareCrews(externalCrews, user.externalCrews)

    const after = {
      username: nextUsername,
      name: cleanedName,
      externalCrews: nextCrews,
      image: removeAvatar === true ? null : undefined,
    }
    const changes = diffFields(
      { username: user.username, name: user.name, externalCrews: user.externalCrews, image: user.image },
      after,
    )

    if (Object.keys(changes).length > 0) {
      // The audit row is built first: it throws if the actor's email is missing, before any write is queued.
      const audit = auditData({
        actor: { id: actor.id, username: ctx.username, email: ctx.email },
        action: 'USER_EDIT',
        target: { id: user.id, username: user.username, email: user.email },
        details: { changes },
      })
      const data = Object.fromEntries(Object.entries(changes).map(([key, change]) => [key, change.to]))
      // One transaction: the edit and its audit entry both happen or neither does.
      await db.$transaction([
        db.user.update({ where: { id: user.id }, data }),
        db.adminAuditLog.create({ data: audit }),
      ])
    }

    return (await loadAdminUserRows([user.id]))[0]
  },

  adminSuspendUser: async (_: unknown, args: AdminSuspendUserArgs, ctx: Context) => {
    // Same order as adminUpdateUser: access check, load, target-aware check, then validate.
    requireAdmin(ctx, 'viewAdmin')
    const user = await loadSuspensionTarget(args.userId)
    const actor = requireAdmin(ctx, 'manageUser', { id: user.id, role: user.role })

    const { reason, until } = cleanSuspension({ reason: args.reason, until: args.until })

    const audit = auditData({
      actor: { id: actor.id, username: ctx.username, email: ctx.email },
      action: 'USER_SUSPEND',
      target: { id: user.id, username: user.username, email: user.email },
      details: { reason, until: until?.toISOString() ?? null },
    })
    // Suspending someone already suspended simply replaces the reason and date, and logs again.
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { suspendedAt: new Date(), suspendedUntil: until, suspensionReason: reason },
      }),
      db.adminAuditLog.create({ data: audit }),
    ])

    return (await loadAdminUserRows([user.id]))[0]
  },

  adminReinstateUser: async (_: unknown, args: { userId: string }, ctx: Context) => {
    requireAdmin(ctx, 'viewAdmin')
    const user = await loadSuspensionTarget(args.userId)
    const actor = requireAdmin(ctx, 'manageUser', { id: user.id, role: user.role })

    const clear = { suspendedAt: null, suspendedUntil: null, suspensionReason: null }

    if (isSuspended(user)) {
      const audit = auditData({
        actor: { id: actor.id, username: ctx.username, email: ctx.email },
        action: 'USER_REINSTATE',
        target: { id: user.id, username: user.username, email: user.email },
        details: { previousReason: user.suspensionReason, previousUntil: user.suspendedUntil?.toISOString() ?? null },
      })
      await db.$transaction([
        db.user.update({ where: { id: user.id }, data: clear }),
        db.adminAuditLog.create({ data: audit }),
      ])
    } else if (user.suspendedAt !== null || user.suspendedUntil !== null || user.suspensionReason !== null) {
      // Not suspended right now, but an expired suspension left stale fields behind. Tidy them up
      // silently: nothing was lifted, so there is nothing to put in the audit log.
      await db.user.update({ where: { id: user.id }, data: clear })
    }
    // Never suspended: nothing to do and nothing to log. The row is still returned.

    return (await loadAdminUserRows([user.id]))[0]
  },

  adminDeleteUser: async (_: unknown, args: AdminDeleteUserArgs, ctx: Context) => {
    // Same order as the other admin mutations: access check before any database read, then the
    // load, then the target-aware check.
    requireAdmin(ctx, 'viewAdmin')
    const user = await db.user.findUnique({
      where: { id: args.userId },
      select: { id: true, role: true, username: true, email: true },
    })
    if (!user) {
      throw new GraphQLError('User not found', { extensions: { code: 'NOT_FOUND' } })
    }
    const actor = requireAdmin(ctx, 'manageUser', { id: user.id, role: user.role })
    const blockEmail = args.blockEmail === true

    // Counted before the delete, for the audit entry: afterwards the rows are gone.
    const [entries, votesCast, votesReceived] = await Promise.all([
      db.submission.count({ where: { userId: user.id } }),
      db.vote.count({ where: { userId: user.id } }),
      db.vote.count({ where: { submission: { userId: user.id } } }),
    ])

    // Audit rows are built first: they throw if the actor's email is missing, before any write is queued.
    // They snapshot the target's username and email, so they still read correctly once the user is gone.
    const actorParty = { id: actor.id, username: ctx.username, email: ctx.email }
    const targetParty = { id: user.id, username: user.username, email: user.email }
    const blockAudit = blockEmail
      ? auditData({ actor: actorParty, action: 'EMAIL_BLOCK', target: targetParty })
      : null
    const deleteAudit = auditData({
      actor: actorParty,
      action: 'USER_DELETE',
      target: targetParty,
      details: { entries, votesCast, votesReceived, emailBlocked: blockEmail },
    })

    // One transaction. The database cascades the user's entries, the votes they cast and the votes on
    // their entries (and their accounts, sessions and crew memberships), so there are no manual deletes.
    // The audit rows come before the delete; the delete is last.
    const lowerEmail = user.email.toLowerCase()
    await db.$transaction([
      ...(blockAudit
        ? [
            // An upsert that leaves an existing row alone: blocking an already blocked email is fine.
            db.bannedEmail.upsert({
              where: { email: lowerEmail },
              create: { email: lowerEmail, reason: 'Blocked when the account was deleted', createdById: actor.id },
              update: {},
            }),
            db.adminAuditLog.create({ data: blockAudit }),
          ]
        : []),
      db.adminAuditLog.create({ data: deleteAudit }),
      db.user.delete({ where: { id: user.id } }),
    ])

    return true
  },
}

export const AdminUser = {
  createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
  lastSignInAt: (parent: { lastSignInAt: Date }) => parent.lastSignInAt.toISOString(),
  suspendedUntil: (parent: { suspendedUntil: Date | null }) => parent.suspendedUntil?.toISOString() ?? null,
}
