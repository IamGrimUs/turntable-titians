import { gql } from '@apollo/client'

/**
 * The light runoff selection for battle lists (battles page, Hall of Fame results): enough to say
 * "runoff open" or show the result. No viewer fields and no heavy submission fields, so a list of
 * battles stays cheap. Splice it inside `runoff { ... }`. `submission { id }` is needed: `candidates` has
 * no id, so a list write replaces the array, and Apollo can only keep the page's other submission
 * fields (video, image) if it can tell which Submission each candidate is.
 */
export const RUNOFF_FIELDS = `
  status
  endsAt
  candidates {
    submission { id user { id username name } }
    votes
  }
`

/**
 * The full runoff selection for one battle page: the dates, the viewer's own choice and whether they
 * may vote, and the entries to watch. Splice it inside `runoff { ... }`. Only used by `GET_BATTLE`.
 */
export const RUNOFF_DETAIL_FIELDS = `
  status
  opensAt
  endsAt
  viewerVoteSubmissionId
  viewerCanVote
  candidates {
    votes
    submission { id videoUrl user { id username name image } }
  }
`

export const CAST_RUNOFF_VOTE = gql`
  mutation CastRunoffVote($submissionId: ID!) {
    castRunoffVote(submissionId: $submissionId)
  }
`

export const REMOVE_RUNOFF_VOTE = gql`
  mutation RemoveRunoffVote($battleId: ID!) {
    removeRunoffVote(battleId: $battleId)
  }
`
