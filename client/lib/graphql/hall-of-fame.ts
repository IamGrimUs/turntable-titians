import { gql } from '@apollo/client'

/** The Champions tab: everyone with a win, already ranked by the server. */
export const GET_HALL_OF_FAME = gql`
  query GetHallOfFame {
    hallOfFame {
      rank
      wins
      battlesEntered
      lastWinAt
      user { id username name image }
    }
  }
`

/** The Battle results tab. `submissions` is only used to count entries. */
export const GET_BATTLE_RESULTS = gql`
  query GetBattleResults {
    battles {
      id
      title
      type
      endDate
      status
      winningVotes
      winners { id username name image }
      submissions { id }
    }
  }
`

/** The home page "Latest champions" strip. Winners are only ever filled in for completed battles. */
export const GET_LATEST_CHAMPIONS = gql`
  query GetLatestChampions {
    battles {
      id
      title
      endDate
      status
      winningVotes
      winners { id username name image battlesWon }
    }
  }
`
