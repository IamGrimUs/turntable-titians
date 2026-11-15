import { GraphQLError } from 'graphql'
import { db } from './db'
import { requireAdmin, type Context } from './context'
import { auditData, diffFields } from './audit'
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
}

export const AdminUser = {
  createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
  lastSignInAt: (parent: { lastSignInAt: Date }) => parent.lastSignInAt.toISOString(),
  suspendedUntil: (parent: { suspendedUntil: Date | null }) => parent.suspendedUntil?.toISOString() ?? null,
}
