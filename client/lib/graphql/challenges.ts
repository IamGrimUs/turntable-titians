import { gql } from '@apollo/client'

/**
 * Direct challenges (one DJ challenges another to a head to head duel).
 *
 * `DUEL_FIELDS` and `HEAD_TO_HEAD_FIELDS` are field strings to splice inside `duel { ... }` and
 * `headToHead { ... }`, like `RUNOFF_FIELDS`. Keep the nesting shallow: the server refuses queries
 * deeper than 6 levels (the root field is level 1).
 */

/** The light duel: both DJs, the result and the winner's id. Counts and outcome are null until the duel is COMPLETED. */
export const DUEL_FIELDS = `
  challenger { id username name image }
  opponent { id username name image }
  outcome
  challengerVotes
  opponentVotes
  winner { id }
`

/** A user's duel record and their last five finished duels. Used on the public profile only. */
export const HEAD_TO_HEAD_FIELDS = `
  wins
  losses
  draws
  results(limit: 5) {
    battleId
    result
    endedAt
    opponent { id username name image }
  }
`

/**
 * What every list row and every mutation result carries, so one cached `Challenge:<id>` stays current
 * after any action. No message and never `challengerVideoUrl`: that field is only asked for by
 * `GET_CHALLENGE`, and the server only ever returns it to the challenger of a waiting challenge.
 */
const CHALLENGE_SUMMARY_FIELDS = `
  id
  title
  votingDays
  status
  expiresAt
  createdAt
  respondedAt
  viewerRole
  battleId
  challenger { id username name image }
  opponent { id username name image }
`

export const CREATE_CHALLENGE = gql`
  mutation CreateChallenge(
    $opponentUsername: String!
    $title: String!
    $message: String
    $videoUrl: String!
    $votingDays: Int!
  ) {
    createChallenge(
      opponentUsername: $opponentUsername
      title: $title
      message: $message
      videoUrl: $videoUrl
      votingDays: $votingDays
    ) {
      ${CHALLENGE_SUMMARY_FIELDS}
    }
  }
`

export const ACCEPT_CHALLENGE = gql`
  mutation AcceptChallenge($id: ID!, $videoUrl: String!) {
    acceptChallenge(id: $id, videoUrl: $videoUrl) {
      ${CHALLENGE_SUMMARY_FIELDS}
    }
  }
`

export const DECLINE_CHALLENGE = gql`
  mutation DeclineChallenge($id: ID!) {
    declineChallenge(id: $id) {
      ${CHALLENGE_SUMMARY_FIELDS}
    }
  }
`

export const WITHDRAW_CHALLENGE = gql`
  mutation WithdrawChallenge($id: ID!) {
    withdrawChallenge(id: $id) {
      ${CHALLENGE_SUMMARY_FIELDS}
    }
  }
`

/**
 * The challenge screen. `challengerVideoUrl` is null for everyone but the challenger of a waiting
 * challenge. The second `challenger` selection adds career wins (the opponent decides from the
 * challenger's record); Apollo and the server merge it with the one in the summary fields.
 */
export const GET_CHALLENGE = gql`
  query GetChallenge($id: ID!) {
    challenge(id: $id) {
      ${CHALLENGE_SUMMARY_FIELDS}
      challenger { battlesWon }
      message
      challengerVideoUrl
    }
  }
`

/** The "Your challenges" section: at most 50 rows, newest first. */
export const GET_MY_CHALLENGES = gql`
  query GetMyChallenges {
    myChallenges {
      ${CHALLENGE_SUMMARY_FIELDS}
    }
  }
`

/** The nav count: how many challenges wait for the caller's answer. */
export const GET_CHALLENGES_WAITING = gql`
  query GetChallengesWaiting {
    challengesWaiting
  }
`
