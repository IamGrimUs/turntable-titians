import { gql } from '@apollo/client';

// Suggestions board documents. Selections mirror the SDL in server/src/schema.ts (`Idea`,
// `IdeaComment`, `IdeaPage`). The API exposes only counts and the caller's own vote, never
// an email or the voters, so none is selected here.
//
// The list query selects `commentCount` and deliberately NOT `comments`: a nested comment
// list per row would be an N+1 on the server. Only the detail query loads comments.

const AUTHOR = `
  author {
    id
    username
    name
    image
  }
`;

const COMMENT_FIELDS = `
  id
  ideaId
  body
  hidden
  voteCount
  viewerHasVoted
  createdAt
  ${AUTHOR}
`;

const IDEA_FIELDS = `
  id
  title
  body
  category
  topic
  status
  hidden
  voteCount
  commentCount
  viewerHasVoted
  createdAt
  ${AUTHOR}
`;

export const GET_IDEAS = gql`
  query GetIdeas(
    $category: IdeaCategory
    $topic: IdeaTopic
    $status: IdeaStatus
    $sort: IdeaSort
    $includeHidden: Boolean
    $page: Int
    $pageSize: Int
  ) {
    ideas(
      category: $category
      topic: $topic
      status: $status
      sort: $sort
      includeHidden: $includeHidden
      page: $page
      pageSize: $pageSize
    ) {
      rows {
        ${IDEA_FIELDS}
      }
      total
      page
      pageCount
    }
  }
`;

export const GET_IDEA = gql`
  query GetIdea($id: ID!) {
    idea(id: $id) {
      ${IDEA_FIELDS}
      comments {
        ${COMMENT_FIELDS}
      }
    }
  }
`;

export const CREATE_IDEA = gql`
  mutation CreateIdea($title: String!, $body: String!, $category: IdeaCategory!, $topic: IdeaTopic) {
    createIdea(title: $title, body: $body, category: $category, topic: $topic) {
      ${IDEA_FIELDS}
    }
  }
`;

export const VOTE_IDEA = gql`
  mutation VoteIdea($ideaId: ID!) {
    voteIdea(ideaId: $ideaId) {
      id
      voteCount
      viewerHasVoted
    }
  }
`;

export const UNVOTE_IDEA = gql`
  mutation UnvoteIdea($ideaId: ID!) {
    unvoteIdea(ideaId: $ideaId) {
      id
      voteCount
      viewerHasVoted
    }
  }
`;

export const CREATE_COMMENT = gql`
  mutation CreateComment($ideaId: ID!, $body: String!) {
    createComment(ideaId: $ideaId, body: $body) {
      ${COMMENT_FIELDS}
    }
  }
`;

export const VOTE_COMMENT = gql`
  mutation VoteComment($commentId: ID!) {
    voteComment(commentId: $commentId) {
      id
      voteCount
      viewerHasVoted
    }
  }
`;

export const UNVOTE_COMMENT = gql`
  mutation UnvoteComment($commentId: ID!) {
    unvoteComment(commentId: $commentId) {
      id
      voteCount
      viewerHasVoted
    }
  }
`;

export const DELETE_IDEA = gql`
  mutation DeleteIdea($id: ID!) {
    deleteIdea(id: $id)
  }
`;

export const DELETE_COMMENT = gql`
  mutation DeleteComment($id: ID!) {
    deleteComment(id: $id)
  }
`;

export const ADMIN_SET_IDEA_STATUS = gql`
  mutation AdminSetIdeaStatus($id: ID!, $status: IdeaStatus!) {
    adminSetIdeaStatus(id: $id, status: $status) {
      id
      status
    }
  }
`;

export const ADMIN_HIDE_IDEA = gql`
  mutation AdminHideIdea($id: ID!) {
    adminHideIdea(id: $id) {
      id
      hidden
    }
  }
`;

export const ADMIN_UNHIDE_IDEA = gql`
  mutation AdminUnhideIdea($id: ID!) {
    adminUnhideIdea(id: $id) {
      id
      hidden
    }
  }
`;

export const ADMIN_DELETE_IDEA = gql`
  mutation AdminDeleteIdea($id: ID!) {
    adminDeleteIdea(id: $id)
  }
`;

export const ADMIN_HIDE_COMMENT = gql`
  mutation AdminHideComment($id: ID!) {
    adminHideComment(id: $id) {
      id
      hidden
    }
  }
`;

export const ADMIN_UNHIDE_COMMENT = gql`
  mutation AdminUnhideComment($id: ID!) {
    adminUnhideComment(id: $id) {
      id
      hidden
    }
  }
`;

export const ADMIN_DELETE_COMMENT = gql`
  mutation AdminDeleteComment($id: ID!) {
    adminDeleteComment(id: $id)
  }
`;
