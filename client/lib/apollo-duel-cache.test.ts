import { describe, expect, it } from 'vitest'
import { InMemoryCache, gql } from '@apollo/client'
import { cacheTypePolicies } from './apollo-client'
import { DUEL_FIELDS, HEAD_TO_HEAD_FIELDS } from './graphql/challenges'

/**
 * `Duel` and `HeadToHeadRecord` have no id, so Apollo would replace `Battle:<id>.duel` and
 * `User:<id>.headToHead` wholesale on every write. Lists, the battle page, the Hall of Fame tab and the
 * profile each select a different slice; `merge: true` makes the slices add up instead of one erasing
 * the other's fields.
 */

const user = (id: string) => ({ __typename: 'User', id, username: id, name: null, image: null })

const BATTLE_LIST = gql`
  query BattleList { battles { id duel { ${DUEL_FIELDS} } } }
`
const BATTLE_RESULTS = gql`
  query BattleResults { battles { id duel { outcome } } }
`
const BATTLE_PAGE = gql`
  query BattlePage($id: ID!) { battle(id: $id) { id duel { ${DUEL_FIELDS} } } }
`

const fullDuel = {
  __typename: 'Duel',
  challenger: user('jo'),
  opponent: user('kay'),
  outcome: 'OPPONENT_WON',
  challengerVotes: 48,
  opponentVotes: 62,
  winner: { __typename: 'User', id: 'kay' },
}

const lightWrite = {
  battles: [{ __typename: 'Battle', id: 'b1', duel: { __typename: 'Duel', outcome: 'OPPONENT_WON' } }],
}

type PageRead = { battle: { duel: typeof fullDuel } } | null

function writePageThenLightList(cache: InMemoryCache) {
  cache.writeQuery({
    query: BATTLE_PAGE,
    variables: { id: 'b1' },
    data: { battle: { __typename: 'Battle', id: 'b1', duel: fullDuel } },
  })
  cache.writeQuery({ query: BATTLE_RESULTS, data: lightWrite })
}

describe('Battle.duel cache policy', () => {
  it('keeps the full duel when a lighter selection is written afterwards', () => {
    const cache = new InMemoryCache({ typePolicies: cacheTypePolicies })
    writePageThenLightList(cache)
    const read = cache.readQuery({ query: BATTLE_PAGE, variables: { id: 'b1' } }) as PageRead
    expect(read).not.toBeNull()
    expect(read?.battle.duel.opponentVotes).toBe(62)
    expect(read?.battle.duel.challenger.id).toBe('jo')
  })

  it('lets the list selection read what the page wrote', () => {
    const cache = new InMemoryCache({ typePolicies: cacheTypePolicies })
    cache.writeQuery({
      query: BATTLE_PAGE,
      variables: { id: 'b1' },
      data: { battle: { __typename: 'Battle', id: 'b1', duel: fullDuel } },
    })
    cache.writeQuery({
      query: BATTLE_LIST,
      data: { battles: [{ __typename: 'Battle', id: 'b1', duel: fullDuel }] },
    })
    const list = cache.readQuery({ query: BATTLE_LIST }) as { battles: { duel: typeof fullDuel }[] } | null
    expect(list?.battles[0].duel.winner.id).toBe('kay')
  })

  it('a null duel (a regular battle) stays null', () => {
    const cache = new InMemoryCache({ typePolicies: cacheTypePolicies })
    cache.writeQuery({
      query: BATTLE_LIST,
      data: { battles: [{ __typename: 'Battle', id: 'b2', duel: null }] },
    })
    const read = cache.readQuery({ query: BATTLE_LIST }) as { battles: { duel: unknown }[] } | null
    expect(read?.battles[0].duel).toBeNull()
  })

  it('without the policy the light write would erase the full duel (the policy is needed)', () => {
    const cache = new InMemoryCache()
    writePageThenLightList(cache)
    expect(cache.readQuery({ query: BATTLE_PAGE, variables: { id: 'b1' } })).toBeNull()
  })
})

const PROFILE_FULL = gql`
  query ProfileFull($id: ID!) { user(id: $id) { id headToHead { ${HEAD_TO_HEAD_FIELDS} } } }
`
const PROFILE_COUNTS = gql`
  query ProfileCounts($id: ID!) { user(id: $id) { id headToHead { wins losses draws } } }
`

const record = {
  __typename: 'HeadToHeadRecord',
  wins: 3,
  losses: 1,
  draws: 1,
  results: [
    { __typename: 'HeadToHeadResult', battleId: 'b1', result: 'WON', endedAt: '2026-11-10', opponent: user('kay') },
  ],
}

const countsOnly = {
  user: {
    __typename: 'User',
    id: 'u1',
    headToHead: { __typename: 'HeadToHeadRecord', wins: 4, losses: 1, draws: 1 },
  },
}

function writeFullThenCounts(cache: InMemoryCache) {
  cache.writeQuery({
    query: PROFILE_FULL,
    variables: { id: 'u1' },
    data: { user: { __typename: 'User', id: 'u1', headToHead: record } },
  })
  cache.writeQuery({ query: PROFILE_COUNTS, variables: { id: 'u1' }, data: countsOnly })
}

describe('User.headToHead cache policy', () => {
  it('keeps the results when a counts-only selection is written afterwards', () => {
    const cache = new InMemoryCache({ typePolicies: cacheTypePolicies })
    writeFullThenCounts(cache)
    const read = cache.readQuery({ query: PROFILE_FULL, variables: { id: 'u1' } }) as
      | { user: { headToHead: typeof record } }
      | null
    expect(read).not.toBeNull()
    expect(read?.user.headToHead.wins).toBe(4)
    expect(read?.user.headToHead.results[0].battleId).toBe('b1')
  })

  it('without the policy the counts-only write would erase the results (the policy is needed)', () => {
    const cache = new InMemoryCache()
    writeFullThenCounts(cache)
    expect(cache.readQuery({ query: PROFILE_FULL, variables: { id: 'u1' } })).toBeNull()
  })
})
