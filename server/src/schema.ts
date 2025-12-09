import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type Battle {
    id: ID!
    title: String!
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
    votes: [Vote!]!
    voteCount: Int!
    createdAt: String!
    updatedAt: String!
  }

  type Vote {
    id: ID!
    submissionId: ID!
    userId: ID!
    createdAt: String!
  }

  type User {
    id: ID!
    username: String!
    email: String!
    submissions: [Submission!]!
    createdAt: String!
  }

  enum BattleStatus {
    UPCOMING
    ACTIVE
    VOTING
    COMPLETED
  }

  type Query {
    battles: [Battle!]!
    battle(id: ID!): Battle
    submission(id: ID!): Submission
    submissions(battleId: ID!): [Submission!]!
    user(id: ID!): User
    health: HealthStatus!
  }

  type Mutation {
    createBattle(
      title: String!
      description: String
      startDate: String!
      endDate: String!
    ): Battle!
    createSubmission(
      battleId: ID!
      userId: ID!
      videoUrl: String!
      title: String
      description: String
    ): Submission!
    vote(submissionId: ID!, userId: ID!): Vote!
    deleteVote(submissionId: ID!, userId: ID!): Boolean!
  }

  type HealthStatus {
    status: String!
    message: String!
  }
`;

