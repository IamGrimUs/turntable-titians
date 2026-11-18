import { gql } from '@apollo/client'
import { HEAD_TO_HEAD_FIELDS } from './challenges'

/** The public profile. `record` feeds the trophy shelf (completed battles only). */
export const GET_USER = gql`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      username
      name
      image
      externalCrews
      battlesWon
      record {
        wins
        podiums
        bestFinish
        currentStreak
        bestStreak
        battlesEntered
      }
      headToHead { ${HEAD_TO_HEAD_FIELDS} }
      submissions {
        id
        title
        battleId
        voteCount
        createdAt
      }
    }
  }
`
