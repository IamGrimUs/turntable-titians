import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type Battle {
    id: ID!
    title: String!
    type: String!
    description: String
    startDate: String!
    endDate: String!
    status: BattleStatus!
    submissions: [Submission!]!
    createdAt: String!
    updatedAt: String!
  }

  type Submission {
    id: ID!
    battleId: ID!
    userId: ID!
    videoUrl: String!
    title: String
    description: String
    """Total votes. Null until the battle is COMPLETED: counts are hidden while voting is open."""
    voteCount: Int
    """Whether the authenticated caller has voted for this submission. False when logged out."""
    viewerHasVoted: Boolean!
    createdAt: String!
    updatedAt: String!
    user: User!
  }

  type Vote {
    id: ID!
    submissionId: ID!
    battleId: ID!
    createdAt: String!
  }

  type User {
    id: ID!
    username: String
    name: String
    image: String
    externalCrews: [String!]!
    submissions: [Submission!]!
    createdAt: String!
  }

  type Crew {
    id: ID!
    name: String!
    createdAt: String!
  }

  enum BattleStatus {
    UPCOMING
    ACTIVE
    COMPLETED
  }

  enum UserRole {
    USER
    ADMIN
    OWNER
  }

  enum UserStatus {
    ACTIVE
    SUSPENDED
  }

  enum AdminUserFilter {
    ALL
    ACTIVE
    SUSPENDED
    ADMINS
  }

  enum AdminUserSortKey {
    role
    username
    crews
    status
    entries
    battlesWon
    votesCast
    votesReceived
    createdAt
    lastSignInAt
    email
  }

  enum SortDirection {
    ASC
    DESC
  }

  """Admin-only view of a user. Never reachable from public queries; email lives only here."""
  type AdminUser {
    id: ID!
    username: String
    name: String
    image: String
    email: String!
    role: UserRole!
    status: UserStatus!
    suspendedUntil: String
    suspensionReason: String
    crews: [String!]!
    entries: Int!
    battlesWon: Int!
    votesCast: Int!
    votesReceived: Int!
    createdAt: String!
    lastSignInAt: String!
  }

  type AdminUserCounts {
    all: Int!
    active: Int!
    suspended: Int!
    admins: Int!
  }

  type AdminUserPage {
    rows: [AdminUser!]!
    total: Int!
    page: Int!
    pageCount: Int!
    counts: AdminUserCounts!
  }

  type Query {
    battles: [Battle!]!
    battle(id: ID!): Battle
    battleTypes: [String!]!
    submission(id: ID!): Submission
    submissions(battleId: ID!): [Submission!]!
    user(id: ID!): User
    me: User
    health: HealthStatus!
    adminUsers(
      search: String
      filter: AdminUserFilter = ALL
      sortKey: AdminUserSortKey = createdAt
      sortDir: SortDirection = DESC
      page: Int = 1
      pageSize: Int = 25
    ): AdminUserPage!
  }

  type Mutation {
    createBattle(
      title: String!
      type: String!
      description: String
      startDate: String!
      endDate: String!
    ): Battle!
    createSubmission(
      battleId: ID!
      videoUrl: String!
      title: String
      description: String
    ): Submission!
    updateProfile(
      username: String
      image: String
      externalCrews: [String!]
    ): User!
    adminUpdateUser(
      userId: ID!
      username: String
      name: String
      externalCrews: [String!]
      removeAvatar: Boolean
    ): AdminUser!
    adminSuspendUser(userId: ID!, reason: String!, until: String): AdminUser!
    adminReinstateUser(userId: ID!): AdminUser!
    adminDeleteUser(userId: ID!, blockEmail: Boolean = false): Boolean!
    adminSetUserRole(userId: ID!, role: UserRole!): AdminUser!
    vote(submissionId: ID!): Vote!
    deleteVote(submissionId: ID!): Boolean!
  }

  type HealthStatus {
    status: String!
    message: String!
  }
`;
