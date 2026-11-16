import { GraphQLError } from 'graphql'
import type { Prisma } from '@prisma/client'
import { db } from './db'
import { requireAdmin, type Context } from './context'
import type { Role } from './permissions'
import { auditData, diffFields } from './audit'
import { cleanSuspension, isSuspended } from './suspension'
import { prepareCrews, prepareUsername } from './profileRules'
import { LIMITS, cleanSingleLine } from './validation'
import { loadAdminUserRows } from './adminData'
import { clampPage, clampPageSize, queryAdminUsers, type UserFilter, type UserSortKey } from './adminUserQuery'

export interface AdminUsersArgs {
  search?: string | null
  filter?: UserFilter
  sortKey?: UserSortKey
  sortDir?: 'ASC' | 'DESC'
  page?: number
  pageSize?: number
}

export interface AdminAuditLogArgs {
  page?: number
  pageSize?: number
}

const AUDIT_DEFAULT_PAGE_SIZE = 50
const AUDIT_MAX_PAGE_SIZE = 100

export const adminQuery = {
  adminUsers: async (_: unknown, args: AdminUsersArgs, ctx: Context) => {
    // The permission check comes first: nothing reaches the database for a non-admin.
    requireAdmin(ctx, 'viewAdmin')
    const rows = await loadAdminUserRows()
    return queryAdminUsers(rows, args)
  },

  adminAuditLog: async (_: unknown, args: AdminAuditLogArgs, ctx: Context) => {
    // Owner only. The permission check is the first statement: nothing reaches the database otherwise.
    requireAdmin(ctx, 'viewAuditLog')

    const pageSize = clampPageSize(args.pageSize, AUDIT_DEFAULT_PAGE_SIZE, AUDIT_MAX_PAGE_SIZE)
    const total = await db.adminAuditLog.count()
    const pageCount = Math.max(1, Math.ceil(total / pageSize))
    const page = clampPage(args.page, pageCount)

    // Snapshot columns only (no joins to User). The id breaks ties so paging is stable.
    const rows = await db.adminAuditLog.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    return {
      rows: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        actorId: row.actorId,
        actorUsername: row.actorUsername,
        actorEmail: row.actorEmail,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        targetUsername: row.targetUsername,
        targetEmail: row.targetEmail,
        details: JSON.stringify(row.details ?? {}),
      })),
      total,
      page,
      pageCount,
    }
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

export interface AdminSetUserRoleArgs {
  userId: string
  role: Role
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

/** The columns delete and set-role need about their target: who it is, and what the audit entry snapshots. */
const partyTargetSelect = { id: true, role: true, username: true, email: true } as const

/**
 * Loads the user an admin mutation acts on, or throws NOT_FOUND. Call it only after the coarse
 * `requireAdmin(ctx, 'viewAdmin')` check (R10): a caller who is not allowed in must not be able to
 * learn whether a user id exists. The target-aware `requireAdmin(..., target)` check follows the load.
 */
async function loadTarget<S extends Prisma.UserSelect>(userId: string, select: S) {
  const user = await db.user.findUnique({ where: { id: userId }, select })
  if (!user) {
    throw new GraphQLError('User not found', { extensions: { code: 'NOT_FOUND' } })
  }
  return user
}

/** The actor as the audit log snapshots them: the id the permission check returned, plus the request's name and email. */
function actorParty(ctx: Context, actor: { id: string }) {
  return { id: actor.id, username: ctx.username, email: ctx.email }
}

/** The target as the audit log snapshots them: who they were when the action happened. */
function partyOf(user: { id: string; username: string | null; email: string }) {
  return { id: user.id, username: user.username, email: user.email }
}

/** Admin mutations; each later task adds its own to this object. */
export const adminMutation = {
  adminUpdateUser: async (_: unknown, args: AdminUpdateUserArgs, ctx: Context) => {
    const { userId, username, name, externalCrews, removeAvatar } = args

    // Access check first: nothing reaches the database for a non-admin, and a caller who is not
    // allowed in cannot learn whether a user id exists. The target-aware check follows the load.
    requireAdmin(ctx, 'viewAdmin')

    const user = await loadTarget(userId, {
      id: true,
      role: true,
      username: true,
      name: true,
      image: true,
      externalCrews: true,
      email: true,
    })
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
        actor: actorParty(ctx, actor),
        action: 'USER_EDIT',
        target: partyOf(user),
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
    const user = await loadTarget(args.userId, suspensionTargetSelect)
    const actor = requireAdmin(ctx, 'manageUser', { id: user.id, role: user.role })

    const { reason, until } = cleanSuspension({ reason: args.reason, until: args.until })

    const audit = auditData({
      actor: actorParty(ctx, actor),
      action: 'USER_SUSPEND',
      target: partyOf(user),
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
    const user = await loadTarget(args.userId, suspensionTargetSelect)
    const actor = requireAdmin(ctx, 'manageUser', { id: user.id, role: user.role })

    const clear = { suspendedAt: null, suspendedUntil: null, suspensionReason: null }

    if (isSuspended(user)) {
      const audit = auditData({
        actor: actorParty(ctx, actor),
        action: 'USER_REINSTATE',
        target: partyOf(user),
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
    const user = await loadTarget(args.userId, partyTargetSelect)
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
    const actorSnapshot = actorParty(ctx, actor)
    const targetParty = partyOf(user)
    const blockAudit = blockEmail
      ? auditData({ actor: actorSnapshot, action: 'EMAIL_BLOCK', target: targetParty })
      : null
    const deleteAudit = auditData({
      actor: actorSnapshot,
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

  adminSetUserRole: async (_: unknown, args: AdminSetUserRoleArgs, ctx: Context) => {
    // Access check first: nothing reaches the database for someone who cannot view the admin area.
    requireAdmin(ctx, 'viewAdmin')

    // No API may ever assign OWNER, whoever asks (the owner included). Checked here, on top of
    // `can`, so it holds even if the permission rules change.
    if (args.role === 'OWNER') {
      throw new GraphQLError("You don't have permission to do that.", { extensions: { code: 'FORBIDDEN' } })
    }

    const user = await loadTarget(args.userId, partyTargetSelect)
    // Owner only, and only on a USER or an ADMIN: the OWNER (even the owner themselves) is rejected here.
    const actor = requireAdmin(ctx, 'setRole', { id: user.id, role: user.role })

    // Only USER <-> ADMIN moves are possible. Asking for the role the user already has changes
    // nothing, so there is nothing to write or log.
    if (user.role !== args.role) {
      const audit = auditData({
        actor: actorParty(ctx, actor),
        action: args.role === 'ADMIN' ? 'ROLE_GRANT' : 'ROLE_REVOKE',
        target: partyOf(user),
        details: { from: user.role, to: args.role },
      })
      await db.$transaction([
        db.user.update({ where: { id: user.id }, data: { role: args.role } }),
        db.adminAuditLog.create({ data: audit }),
      ])
    }

    return (await loadAdminUserRows([user.id]))[0]
  },
}

export const AdminUser = {
  createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
  lastSignInAt: (parent: { lastSignInAt: Date }) => parent.lastSignInAt.toISOString(),
  suspendedUntil: (parent: { suspendedUntil: Date | null }) => parent.suspendedUntil?.toISOString() ?? null,
}
