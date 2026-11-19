import { gql } from '@apollo/client'

/** Find a DJ by username. Public fields only: no email, role or suspension. */
export const SEARCH_USERS = gql`
  query SearchUsers($query: String!) {
    searchUsers(query: $query) {
      id
      username
      image
      crew
    }
  }
`
