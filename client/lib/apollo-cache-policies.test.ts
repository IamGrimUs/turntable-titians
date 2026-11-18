import { describe, expect, it } from 'vitest'
import { InMemoryCache, gql } from '@apollo/client'
import { cacheTypePolicies } from './apollo-client'

const LIGHT = gql`
  query Light {
    battles { id runoff { status endsAt } }
  }
`
const FULL = gql`
  query Full($id: ID!) {
    battle(id: $id) { id runoff { status endsAt viewerCanVote } }
  }
`

describe('Battle.runoff cache policy', () => {
  it('merges the light list selection and the full page selection instead of replacing', () => {
    const cache = new InMemoryCache({ typePolicies: cacheTypePolicies })
    cache.writeQuery({
      query: FULL,
      variables: { id: 'b1' },
      data: { battle: { __typename: 'Battle', id: 'b1', runoff: { __typename: 'Runoff', status: 'OPEN', endsAt: 'x', viewerCanVote: true } } },
    })
    cache.writeQuery({
      query: LIGHT,
      data: { battles: [{ __typename: 'Battle', id: 'b1', runoff: { __typename: 'Runoff', status: 'OPEN', endsAt: 'x' } }] },
    })
    const full = cache.readQuery({ query: FULL, variables: { id: 'b1' } }) as { battle: { runoff: { viewerCanVote: boolean } } } | null
    expect(full?.battle.runoff.viewerCanVote).toBe(true)
  })

  it('without the policy the light write would drop the viewer fields (the policy is needed)', () => {
    const cache = new InMemoryCache()
    cache.writeQuery({
      query: FULL,
      variables: { id: 'b1' },
      data: { battle: { __typename: 'Battle', id: 'b1', runoff: { __typename: 'Runoff', status: 'OPEN', endsAt: 'x', viewerCanVote: true } } },
    })
    cache.writeQuery({
      query: LIGHT,
      data: { battles: [{ __typename: 'Battle', id: 'b1', runoff: { __typename: 'Runoff', status: 'OPEN', endsAt: 'x' } }] },
    })
    expect(cache.readQuery({ query: FULL, variables: { id: 'b1' } })).toBeNull()
  })
})
