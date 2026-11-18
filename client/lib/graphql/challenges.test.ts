import { describe, expect, it } from 'vitest'
import { gql } from '@apollo/client'
import {
  Kind,
  print,
  validate,
  type DocumentNode,
  type FragmentDefinitionNode,
  type SelectionSetNode,
} from 'graphql'
import * as challenges from './challenges'
import {
  ACCEPT_CHALLENGE,
  CREATE_CHALLENGE,
  DECLINE_CHALLENGE,
  DUEL_FIELDS,
  GET_CHALLENGE,
  GET_CHALLENGES_WAITING,
  GET_MY_CHALLENGES,
  HEAD_TO_HEAD_FIELDS,
  WITHDRAW_CHALLENGE,
} from './challenges'
import { GET_BATTLE, GET_BATTLES } from './queries'
import { GET_BATTLE_RESULTS, GET_LATEST_CHAMPIONS } from './hall-of-fame'
import { GET_USER } from './user-profile'
import { loadServerSchema } from '../test-support/server-sdl'

const schema = loadServerSchema()

const challengeDocuments: [string, DocumentNode][] = [
  ['CREATE_CHALLENGE', CREATE_CHALLENGE],
  ['ACCEPT_CHALLENGE', ACCEPT_CHALLENGE],
  ['DECLINE_CHALLENGE', DECLINE_CHALLENGE],
  ['WITHDRAW_CHALLENGE', WITHDRAW_CHALLENGE],
  ['GET_CHALLENGE', GET_CHALLENGE],
  ['GET_MY_CHALLENGES', GET_MY_CHALLENGES],
  ['GET_CHALLENGES_WAITING', GET_CHALLENGES_WAITING],
]

const modifiedDocuments: [string, DocumentNode][] = [
  ['GET_BATTLES', GET_BATTLES],
  ['GET_BATTLE', GET_BATTLE],
  ['GET_BATTLE_RESULTS', GET_BATTLE_RESULTS],
  ['GET_LATEST_CHAMPIONS', GET_LATEST_CHAMPIONS],
  ['GET_USER', GET_USER],
]

const all = [...challengeDocuments, ...modifiedDocuments]

/** Collapses whitespace so selections can be compared as text. */
const flat = (doc: DocumentNode) => print(doc).replace(/\s+/g, ' ')
const flatText = (text: string) => text.replace(/\s+/g, ' ').trim()

/** The server refuses queries deeper than 6 (the root field is level 1); see server/src/queryLimits.ts. */
const SERVER_MAX_DEPTH = 6

function depthOf(doc: DocumentNode): number {
  const fragments = new Map<string, FragmentDefinitionNode>()
  for (const def of doc.definitions) if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def)
  const walk = (set: SelectionSetNode, depth: number, seen: Set<string>): number => {
    let deepest = depth - 1
    for (const sel of set.selections) {
      if (sel.kind === Kind.FIELD) {
        deepest = Math.max(deepest, depth)
        if (sel.selectionSet) deepest = Math.max(deepest, walk(sel.selectionSet, depth + 1, seen))
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        deepest = Math.max(deepest, walk(sel.selectionSet, depth, seen))
      } else if (!seen.has(sel.name.value)) {
        const fragment = fragments.get(sel.name.value)
        if (fragment) deepest = Math.max(deepest, walk(fragment.selectionSet, depth, new Set(seen).add(sel.name.value)))
      }
    }
    return deepest
  }
  let max = 0
  for (const def of doc.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION) max = Math.max(max, walk(def.selectionSet, 1, new Set()))
  }
  return max
}

describe('challenge documents against the server SDL', () => {
  it('exports every expected document and the two field strings', () => {
    const exported = Object.entries(challenges)
      .filter((entry): entry is [string, DocumentNode] => (entry[1] as DocumentNode | undefined)?.kind === 'Document')
      .map(([name]) => name)
      .sort()
    expect(exported).toEqual(challengeDocuments.map(([name]) => name).sort())
    expect(typeof DUEL_FIELDS).toBe('string')
    expect(typeof HEAD_TO_HEAD_FIELDS).toBe('string')
  })

  it.each(all)('%s is valid', (_name, doc) => {
    expect(validate(schema, doc).map((e) => e.message)).toEqual([])
  })

  it.each(all)('%s stays within the server depth limit (6)', (_name, doc) => {
    expect(depthOf(doc)).toBeLessThanOrEqual(SERVER_MAX_DEPTH)
  })

  it('the depth helper measures nesting (it bites)', () => {
    const deep = gql`
      query Deep {
        a { b { c { d { e { f { g } } } } } }
      }
    `
    expect(depthOf(deep)).toBe(7)
    expect(depthOf(gql`query Shallow { a { b } }`)).toBe(2)
  })

  it.each(all)('%s selects no email or voter field', (_name, doc) => {
    const text = print(doc)
    expect(text).not.toContain('email')
    expect(text).not.toContain('voters')
    expect(text).not.toContain('votes {')
  })

  it('rejects an invalid selection (the validation bites)', () => {
    const bad = gql`
      query Bad {
        myChallenges { notAField }
      }
    `
    expect(validate(schema, bad).length).toBeGreaterThan(0)
  })
})

describe('challenge mutations', () => {
  it('CREATE_CHALLENGE passes every argument the server takes', () => {
    const text = flat(CREATE_CHALLENGE)
    expect(text).toContain(
      'mutation CreateChallenge($opponentUsername: String!, $title: String!, $message: String, $videoUrl: String!, $votingDays: Int!)',
    )
    // graphql's printer breaks long argument lists onto separate lines, without commas.
    expect(text).toContain(
      'createChallenge( opponentUsername: $opponentUsername title: $title message: $message videoUrl: $videoUrl votingDays: $votingDays )',
    )
  })

  it('ACCEPT_CHALLENGE sends the opponent entry and returns the battle id', () => {
    const text = flat(ACCEPT_CHALLENGE)
    expect(text).toContain('mutation AcceptChallenge($id: ID!, $videoUrl: String!)')
    expect(text).toContain('acceptChallenge(id: $id, videoUrl: $videoUrl)')
    expect(text).toContain('battleId')
  })

  it('DECLINE_CHALLENGE and WITHDRAW_CHALLENGE take the id', () => {
    expect(flat(DECLINE_CHALLENGE)).toContain('declineChallenge(id: $id)')
    expect(flat(WITHDRAW_CHALLENGE)).toContain('withdrawChallenge(id: $id)')
  })

  it('every mutation returns the id and status so the cached challenge updates', () => {
    for (const doc of [CREATE_CHALLENGE, ACCEPT_CHALLENGE, DECLINE_CHALLENGE, WITHDRAW_CHALLENGE]) {
      const text = flat(doc)
      expect(text).toMatch(/\bid\b/)
      expect(text).toMatch(/\bstatus\b/)
    }
  })

  it('no mutation asks for the challenger video link', () => {
    for (const doc of [CREATE_CHALLENGE, ACCEPT_CHALLENGE, DECLINE_CHALLENGE, WITHDRAW_CHALLENGE]) {
      expect(print(doc)).not.toContain('challengerVideoUrl')
    }
  })
})

const documentsAskingForVideo = (docs: [string, DocumentNode][]) =>
  docs.filter(([, doc]) => print(doc).includes('challengerVideoUrl')).map(([name]) => name)

describe('the challenger video link', () => {
  it('is selected by GET_CHALLENGE only, in no other document the client sends', () => {
    expect(documentsAskingForVideo(all)).toEqual(['GET_CHALLENGE'])
  })

  it('is not part of the shared field strings either', () => {
    expect(DUEL_FIELDS).not.toContain('challengerVideoUrl')
    expect(HEAD_TO_HEAD_FIELDS).not.toContain('challengerVideoUrl')
  })

  it('the check bites: a document that asks for it is found', () => {
    const leaky = gql`
      query Leaky {
        myChallenges { id challengerVideoUrl }
      }
    `
    expect(documentsAskingForVideo([...all, ['LEAKY', leaky]])).toEqual(['GET_CHALLENGE', 'LEAKY'])
  })
})

describe('challenge queries', () => {
  it('GET_CHALLENGE takes the id and asks for the message and the challenger own entry', () => {
    const text = flat(GET_CHALLENGE)
    expect(text).toContain('query GetChallenge($id: ID!)')
    expect(text).toContain('challenge(id: $id)')
    expect(text).toContain('message')
    expect(text).toContain('challengerVideoUrl')
    expect(text).toContain('viewerRole')
    expect(text).toContain('battleId')
  })

  it('GET_MY_CHALLENGES is the light list: no message, no video link', () => {
    const text = flat(GET_MY_CHALLENGES)
    expect(text).toContain('myChallenges')
    expect(text).toContain('viewerRole')
    expect(text).toContain('expiresAt')
    expect(text).not.toContain('message')
    expect(text).not.toContain('challengerVideoUrl')
  })

  it('GET_CHALLENGES_WAITING asks for the count only', () => {
    expect(flat(GET_CHALLENGES_WAITING)).toContain('challengesWaiting')
    expect(flat(GET_CHALLENGES_WAITING)).not.toContain('{ id')
  })
})

describe('shared field strings', () => {
  it('DUEL_FIELDS is the light duel: both DJs, the result and the winner id', () => {
    const text = flatText(DUEL_FIELDS)
    expect(text).toContain('challenger { id username name image }')
    expect(text).toContain('opponent { id username name image }')
    for (const field of ['outcome', 'challengerVotes', 'opponentVotes', 'winner { id }']) expect(text).toContain(field)
  })

  it('HEAD_TO_HEAD_FIELDS is the record plus the last five results', () => {
    const text = flatText(HEAD_TO_HEAD_FIELDS)
    for (const field of ['wins', 'losses', 'draws', 'results(limit: 5)', 'battleId', 'result', 'endedAt']) {
      expect(text).toContain(field)
    }
    expect(text).toContain('opponent { id username name image }')
  })

  it('can be spliced into valid documents', () => {
    const doc = gql`
      query Spliced($id: ID!) {
        battles { id duel { ${DUEL_FIELDS} } }
        user(id: $id) { id headToHead { ${HEAD_TO_HEAD_FIELDS} } }
      }
    `
    expect(validate(schema, doc).map((e) => e.message)).toEqual([])
  })
})

describe('documents that now select the duel', () => {
  it.each([
    ['GET_BATTLES', GET_BATTLES],
    ['GET_BATTLE', GET_BATTLE],
  ] as [string, DocumentNode][])('%s selects the light duel', (_name, doc) => {
    expect(flat(doc)).toContain(`duel { ${flatText(DUEL_FIELDS)} }`)
  })

  it.each([
    ['GET_BATTLE_RESULTS', GET_BATTLE_RESULTS],
    ['GET_LATEST_CHAMPIONS', GET_LATEST_CHAMPIONS],
  ] as [string, DocumentNode][])('%s selects only duel { outcome }, to tell duels from regular battles', (_name, doc) => {
    const text = flat(doc)
    expect(text).toContain('duel { outcome }')
    expect(text).not.toContain('challengerVotes')
  })

  it('GET_USER selects the head to head record', () => {
    expect(flat(GET_USER)).toContain(`headToHead { ${flatText(HEAD_TO_HEAD_FIELDS)} }`)
  })
})
