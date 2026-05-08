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
    votes: [Vote!]!
    voteCount: Int!
    createdAt: String!
    updatedAt: String!
  }

  type Vote {
    id: ID!
    submissionId: ID!
    battleId: ID!
    userId: ID!
    createdAt: String!
  }

  type User {
    id: ID!
    username: String
    name: String
    email: String!
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
    VOTING
    COMPLETED
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
    vote(submissionId: ID!): Vote!
    deleteVote(submissionId: ID!): Boolean!
  }

  type HealthStatus {
    status: String!
    message: String!
  }
`;
