import { gql } from '@apollo/client';

// Admin API documents. Selections mirror the SDL in server/src/schema.ts (`AdminUser`,
// `AdminUserPage`, `AuditLogEntry`, `AuditLogPage`). Email is admin-only data and is only
// ever selected here.

export const ADMIN_USER_FIELDS = gql`
  fragment AdminUserFields on AdminUser {
    id
    username
    name
    image
    email
    role
    status
    suspendedUntil
    suspensionReason
    crews
    entries
    battlesWon
    votesCast
    votesReceived
    createdAt
    lastSignInAt
  }
`;

export const ADMIN_USERS_QUERY = gql`
  query AdminUsers(
    $search: String
    $filter: AdminUserFilter
    $sortKey: AdminUserSortKey
    $sortDir: SortDirection
    $page: Int
    $pageSize: Int
  ) {
    adminUsers(
      search: $search
      filter: $filter
      sortKey: $sortKey
      sortDir: $sortDir
      page: $page
      pageSize: $pageSize
    ) {
      rows {
        ...AdminUserFields
      }
      total
      page
      pageCount
      counts {
        all
        active
        suspended
        admins
      }
    }
  }
  ${ADMIN_USER_FIELDS}
`;

// The users table only carries the merged crew list (app crews + the user's own list). The edit
// dialog needs the user's own (external) list, which is what adminUpdateUser changes. The public
// `user` query already exposes it.
export const USER_EXTERNAL_CREWS_QUERY = gql`
  query UserExternalCrews($id: ID!) {
    user(id: $id) {
      id
      externalCrews
    }
  }
`;

export const ADMIN_UPDATE_USER = gql`
  mutation AdminUpdateUser(
    $userId: ID!
    $username: String
    $name: String
    $externalCrews: [String!]
    $removeAvatar: Boolean
  ) {
    adminUpdateUser(
      userId: $userId
      username: $username
      name: $name
      externalCrews: $externalCrews
      removeAvatar: $removeAvatar
    ) {
      ...AdminUserFields
    }
  }
  ${ADMIN_USER_FIELDS}
`;

export const ADMIN_SUSPEND_USER = gql`
  mutation AdminSuspendUser($userId: ID!, $reason: String!, $until: String) {
    adminSuspendUser(userId: $userId, reason: $reason, until: $until) {
      ...AdminUserFields
    }
  }
  ${ADMIN_USER_FIELDS}
`;

export const ADMIN_REINSTATE_USER = gql`
  mutation AdminReinstateUser($userId: ID!) {
    adminReinstateUser(userId: $userId) {
      ...AdminUserFields
    }
  }
  ${ADMIN_USER_FIELDS}
`;

export const ADMIN_DELETE_USER = gql`
  mutation AdminDeleteUser($userId: ID!, $blockEmail: Boolean) {
    adminDeleteUser(userId: $userId, blockEmail: $blockEmail)
  }
`;

export const ADMIN_SET_USER_ROLE = gql`
  mutation AdminSetUserRole($userId: ID!, $role: UserRole!) {
    adminSetUserRole(userId: $userId, role: $role) {
      ...AdminUserFields
    }
  }
  ${ADMIN_USER_FIELDS}
`;

export const ADMIN_AUDIT_LOG_QUERY = gql`
  query AdminAuditLog($page: Int, $pageSize: Int) {
    adminAuditLog(page: $page, pageSize: $pageSize) {
      rows {
        id
        createdAt
        actorId
        actorUsername
        actorEmail
        action
        targetType
        targetId
        targetUsername
        targetEmail
        details
      }
      total
      page
      pageCount
    }
  }
`;
