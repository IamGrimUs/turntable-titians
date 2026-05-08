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
      type
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
        votes { id userId }
        user { id username name image }
      }
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_BATTLE = gql`
  mutation CreateBattle(
    $title: String!
    $type: String!
    $description: String
    $startDate: String!
    $endDate: String!
  ) {
    createBattle(
      title: $title
      type: $type
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

export const ME_QUERY = gql`
  query Me {
    me {
      id
      username
      name
      email
      image
      externalCrews
    }
  }
`;

export const UPDATE_PROFILE_MUTATION = gql`
  mutation UpdateProfile($username: String, $image: String, $externalCrews: [String!]) {
    updateProfile(username: $username, image: $image, externalCrews: $externalCrews) {
      id
      username
      name
      email
      image
      externalCrews
    }
  }
`;

export const VOTE_MUTATION = gql`
  mutation Vote($submissionId: ID!) {
    vote(submissionId: $submissionId) {
      id
      submissionId
      battleId
      userId
      createdAt
    }
  }
`;

export const DELETE_VOTE_MUTATION = gql`
  mutation DeleteVote($submissionId: ID!) {
    deleteVote(submissionId: $submissionId)
  }
`;

export const CREATE_SUBMISSION = gql`
  mutation CreateSubmission($battleId: ID!, $videoUrl: String!, $title: String, $description: String) {
    createSubmission(battleId: $battleId, videoUrl: $videoUrl, title: $title, description: $description) {
      id
      userId
      videoUrl
      title
      description
      voteCount
      createdAt
      user { id username name image }
    }
  }
`;

