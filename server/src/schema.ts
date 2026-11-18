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
    """Who won. Empty while the battle is open and when nobody got a vote. A tie lists everyone tied."""
    winners: [User!]!
    """Votes the winning entry got (the tied top total on a tie). Null while the battle is open and when nobody won."""
    winningVotes: Int
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
    """COMPLETED battles where this user's entry had the most votes (ties count for everyone tied). Open battles never count."""
    battlesWon: Int!
    """Results across COMPLETED battles only. Open battles never count."""
    record: UserRecord!
    createdAt: String!
  }

  """A user's results across completed battles."""
  type UserRecord {
    wins: Int!
    """Finished first, second or third."""
    podiums: Int!
    """Lowest place reached (1 is best). Null if the user never placed."""
    bestFinish: Int
    """Wins in a row, counting only battles the user entered, ending at the most recent one."""
    currentStreak: Int!
    bestStreak: Int!
    """Completed battles the user entered."""
    battlesEntered: Int!
  }

  """One row of the Hall of Fame: a user with at least one win."""
  type Champion {
    """Ranked by wins. Equal wins share a rank (1, 2, 2, 4)."""
    rank: Int!
    user: User!
    wins: Int!
    battlesEntered: Int!
    lastWinAt: String!
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
    ideasPosted
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
    ideasPosted: Int!
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

  """One row of the append-only admin audit log. Snapshot columns only; details is JSON text."""
  type AuditLogEntry {
    id: ID!
    createdAt: String!
    actorId: ID!
    actorUsername: String
    actorEmail: String!
    action: String!
    targetType: String!
    targetId: ID!
    targetUsername: String
    targetEmail: String
    details: String!
  }

  type AuditLogPage {
    rows: [AuditLogEntry!]!
    total: Int!
    page: Int!
    pageCount: Int!
  }

  enum IdeaCategory {
    BUG
    SUGGESTION
    OTHER
  }

  enum IdeaTopic {
    BATTLES
    VOTING
    PROFILES
    LOGIN_ACCOUNT
    SITE_WIDE
  }

  enum IdeaStatus {
    OPEN
    PLANNED
    IN_PROGRESS
    DONE
    DECLINED
  }

  enum IdeaSort {
    VOTES
    NEWEST
  }

  """A suggestions board post. Voting is secret: only the count and the caller's own vote are exposed, never who voted. There is deliberately no email or user id here; the author is the public User."""
  type Idea {
    id: ID!
    title: String!
    body: String!
    category: IdeaCategory!
    """Optional area of the site the idea is about."""
    topic: IdeaTopic
    status: IdeaStatus!
    """Hidden by a moderator. Only admins can see a hidden idea; it is never returned to anyone else, including the author."""
    hidden: Boolean!
    author: User!
    voteCount: Int!
    commentCount: Int!
    """Whether the authenticated caller has voted for this idea. False when logged out."""
    viewerHasVoted: Boolean!
    """The idea's comments: at most the first 200 comments, oldest first (commentCount counts all of them). Admins also receive hidden comments, marked \`hidden: true\`; everyone else never receives them."""
    comments: [IdeaComment!]!
    createdAt: String!
  }

  """A comment on an idea. Same privacy as Idea: a count and the caller's own vote, never the voters."""
  type IdeaComment {
    id: ID!
    ideaId: ID!
    body: String!
    """Hidden by a moderator. Only admins can see a hidden comment; it is never returned to anyone else, including the author."""
    hidden: Boolean!
    author: User!
    voteCount: Int!
    """Whether the authenticated caller has voted for this comment. False when logged out."""
    viewerHasVoted: Boolean!
    createdAt: String!
  }

  type IdeaPage {
    rows: [Idea!]!
    total: Int!
    page: Int!
    pageCount: Int!
  }

  type Query {
    battles: [Battle!]!
    battle(id: ID!): Battle
    battleTypes: [String!]!
    submission(id: ID!): Submission
    submissions(battleId: ID!): [Submission!]!
    user(id: ID!): User
    me: User
    """Everyone with at least one win in a completed battle, most wins first."""
    hallOfFame: [Champion!]!
    health: HealthStatus!
    adminUsers(
      search: String
      filter: AdminUserFilter = ALL
      sortKey: AdminUserSortKey = createdAt
      sortDir: SortDirection = DESC
      page: Int = 1
      pageSize: Int = 25
    ): AdminUserPage!
    adminAuditLog(page: Int = 1, pageSize: Int = 50): AuditLogPage!
    ideas(
      category: IdeaCategory
      topic: IdeaTopic
      status: IdeaStatus
      sort: IdeaSort = VOTES
      includeHidden: Boolean = false
      page: Int = 1
      pageSize: Int = 20
    ): IdeaPage!
    idea(id: ID!): Idea
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
    castRunoffVote(submissionId: ID!): Boolean!
    removeRunoffVote(battleId: ID!): Boolean!
    createIdea(title: String!, body: String!, category: IdeaCategory!, topic: IdeaTopic): Idea!
    deleteIdea(id: ID!): Boolean!
    voteIdea(ideaId: ID!): Idea!
    unvoteIdea(ideaId: ID!): Idea!
    createComment(ideaId: ID!, body: String!): IdeaComment!
    deleteComment(id: ID!): Boolean!
    voteComment(commentId: ID!): IdeaComment!
    unvoteComment(commentId: ID!): IdeaComment!
    adminSetIdeaStatus(id: ID!, status: IdeaStatus!): Idea!
    adminHideIdea(id: ID!): Idea!
    adminUnhideIdea(id: ID!): Idea!
    adminDeleteIdea(id: ID!): Boolean!
    adminHideComment(id: ID!): IdeaComment!
    adminUnhideComment(id: ID!): IdeaComment!
    adminDeleteComment(id: ID!): Boolean!
  }

  type HealthStatus {
    status: String!
    message: String!
  }
`;
