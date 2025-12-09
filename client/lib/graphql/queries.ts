import { gql } from '@apollo/client';

export const GET_BATTLES = gql`
  query GetBattles {
    battles {
      id
      title
      description
      startDate
      endDate
      status
      submissions {
        id
        voteCount
      }
      createdAt
    }
  }
`;

export const GET_BATTLE = gql`
  query GetBattle($id: ID!) {
    battle(id: $id) {
      id
      title
      description
      startDate
      endDate
      status
      submissions {
        id
        userId
        videoUrl
        title
        description
        voteCount
        createdAt
        votes {
          id
          userId
        }
      }
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_BATTLE = gql`
  mutation CreateBattle(
    $title: String!
    $description: String
    $startDate: String!
    $endDate: String!
  ) {
    createBattle(
      title: $title
      description: $description
      startDate: $startDate
      endDate: $endDate
    ) {
      id
      title
      description
      startDate
      endDate
      status
      createdAt
    }
  }
`;

