import { describe, expect, it } from 'vitest'
import { InMemoryCache, gql } from '@apollo/client'
import { cacheTypePolicies } from './apollo-client'
import { RUNOFF_DETAIL_FIELDS, RUNOFF_FIELDS } from './graphql/runoff'

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

// The real selections: the page's full runoff and the lists' light runoff. The candidates are an
// array without ids, so a list write replaces them; they can still be read by the page afterwards
// only if each candidate's submission is a normalized entity (it has an id) that keeps its other fields.
const REAL_FULL = gql`
  query RealFull($id: ID!) {
    battle(id: $id) { id runoff { ${RUNOFF_DETAIL_FIELDS} } }
  }
`
const REAL_LIGHT = gql`
  query RealLight {
    battles { id runoff { ${RUNOFF_FIELDS} } }
  }
`

describe('Battle page after a list write (the real runoff selections)', () => {
  const user = { __typename: 'User', id: 'u1', username: 'nova', name: null, image: 'https://img/nova.png' }
  const full = {
    battle: {
      __typename: 'Battle',
      id: 'b1',
      runoff: {
        __typename: 'Runoff',
        status: 'OPEN',
        opensAt: 'a',
        endsAt: 'b',
        viewerVoteSubmissionId: null,
        viewerCanVote: true,
        candidates: [
          { __typename: 'RunoffCandidate', votes: null, submission: { __typename: 'Submission', id: 's1', videoUrl: 'https://v/1', user } },
        ],
      },
    },
  }
  const list = {
    battles: [
      {
        __typename: 'Battle',
        id: 'b1',
        runoff: {
          __typename: 'Runoff',
          status: 'OPEN',
          endsAt: 'b',
          candidates: [
            { __typename: 'RunoffCandidate', votes: null, submission: { __typename: 'Submission', id: 's1', user: { __typename: 'User', id: 'u1', username: 'nova', name: null } } },
          ],
        },
      },
    ],
  }

  it('the light selection identifies each candidate submission (it selects the id)', () => {
    expect(RUNOFF_FIELDS.replace(/\s+/g, ' ')).toContain('submission { id user {')
  })

  it('can still read the whole battle page from the cache', () => {
    const cache = new InMemoryCache({ typePolicies: cacheTypePolicies })
    cache.writeQuery({ query: REAL_FULL, variables: { id: 'b1' }, data: full })
    cache.writeQuery({ query: REAL_LIGHT, data: list })
    const read = cache.readQuery({ query: REAL_FULL, variables: { id: 'b1' } }) as typeof full | null
    expect(read).not.toBeNull()
    expect(read?.battle.runoff.viewerCanVote).toBe(true)
    expect(read?.battle.runoff.candidates[0].submission.videoUrl).toBe('https://v/1')
    expect(read?.battle.runoff.candidates[0].submission.user.image).toBe('https://img/nova.png')
  })
})
