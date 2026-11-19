'use client'

import { useEffect, useState } from 'react'
import { useApolloClient } from '@apollo/client'
import { SEARCH_USERS } from './graphql/user-search'
import {
  createLatestGate,
  isSearchable,
  SEARCH_LIMITS,
  searchText,
  searchViewState,
  type SearchViewState,
  type UserSearchResult,
} from './user-search'

interface Answer {
  /** The text this answer was searched for. */
  text: string
  results: UserSearchResult[]
  failed: boolean
}

/**
 * Searches for DJs as the person types. Short text issues no request; otherwise the request goes
 * out after the text has been still for `debounceMs`. An answer only counts while it is for the
 * text now in the box, and `createLatestGate` drops an answer that settles after a newer request
 * started or after the text changed or the component went away. Never throws: a failure is
 * reported as the `error` state.
 */
export function useUserSearch(rawText: string): {
  text: string
  state: SearchViewState
  results: UserSearchResult[]
} {
  const client = useApolloClient()
  const text = searchText(rawText)
  const [gate] = useState(createLatestGate)
  const [answer, setAnswer] = useState<Answer | null>(null)

  useEffect(() => {
    if (!isSearchable(text)) return
    const timer = setTimeout(() => {
      const token = gate.next()
      client
        .query<{ searchUsers: UserSearchResult[] }>({
          query: SEARCH_USERS,
          variables: { query: text },
          fetchPolicy: 'network-only',
        })
        .then(
          (result) => {
            if (gate.isLatest(token)) setAnswer({ text, results: result.data?.searchUsers ?? [], failed: false })
          },
          () => {
            if (gate.isLatest(token)) setAnswer({ text, results: [], failed: true })
          },
        )
    }, SEARCH_LIMITS.debounceMs)
    return () => {
      clearTimeout(timer)
      // Anything still in flight is for text that is gone (or the component is): ignore it.
      gate.next()
    }
  }, [client, gate, text])

  const searchable = isSearchable(text)
  // Only an answer for exactly this text counts; until one arrives (including while the debounce
  // waits) the search is loading.
  const current = searchable && answer?.text === text ? answer : null
  const results = current?.results ?? []
  const state = searchViewState({
    text,
    loading: searchable && !current,
    failed: current?.failed ?? false,
    results,
  })
  return { text, state, results }
}
