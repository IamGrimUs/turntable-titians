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
      duel { outcome }
    }
  }
`

/**
 * The home page "Latest champions" strip. Winners are only ever filled in for completed battles.
 * Career wins come from `hallOfFame` (one pass for everyone), not `User.battlesWon`, which would
 * run four queries per winner of every battle just to fill three cards.
 */
export const GET_LATEST_CHAMPIONS = gql`
  query GetLatestChampions {
    battles {
      id
      title
      endDate
      status
      duel { outcome }
      winningVotes
      winners { id username name image }
    }
    hallOfFame {
      wins
      user { id }
    }
  }
`
