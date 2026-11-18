import { describe, expect, it } from 'vitest'
import { gql } from '@apollo/client'
import { print, validate, type DocumentNode } from 'graphql'
import * as runoff from './runoff'
import { CAST_RUNOFF_VOTE, REMOVE_RUNOFF_VOTE } from './runoff'
import { GET_BATTLE, GET_BATTLES } from './queries'
import { GET_BATTLE_RESULTS } from './hall-of-fame'
import { loadServerSchema } from '../test-support/server-sdl'

const schema = loadServerSchema()

const documents: [string, DocumentNode][] = [
  ['CAST_RUNOFF_VOTE', CAST_RUNOFF_VOTE],
  ['REMOVE_RUNOFF_VOTE', REMOVE_RUNOFF_VOTE],
  ['GET_BATTLE', GET_BATTLE],
  ['GET_BATTLES', GET_BATTLES],
  ['GET_BATTLE_RESULTS', GET_BATTLE_RESULTS],
]

const listDocuments: [string, DocumentNode][] = [
  ['GET_BATTLES', GET_BATTLES],
  ['GET_BATTLE_RESULTS', GET_BATTLE_RESULTS],
]

/** Collapses whitespace so selections can be compared as text. */
const flat = (doc: DocumentNode) => print(doc).replace(/\s+/g, ' ')

describe('runoff documents against the server SDL', () => {
  it('exports the mutations and the shared fragment string', () => {
    expect(runoff.CAST_RUNOFF_VOTE?.kind).toBe('Document')
    expect(runoff.REMOVE_RUNOFF_VOTE?.kind).toBe('Document')
    expect(typeof runoff.RUNOFF_FIELDS).toBe('string')
  })

  it.each(documents)('%s is valid', (_name, doc) => {
    expect(validate(schema, doc).map((e) => e.message)).toEqual([])
  })

  it('CAST_RUNOFF_VOTE calls castRunoffVote with the submission id', () => {
    const text = flat(CAST_RUNOFF_VOTE)
    expect(text).toContain('mutation CastRunoffVote($submissionId: ID!)')
    expect(text).toContain('castRunoffVote(submissionId: $submissionId)')
  })

  it('REMOVE_RUNOFF_VOTE calls removeRunoffVote with the battle id', () => {
    const text = flat(REMOVE_RUNOFF_VOTE)
    expect(text).toContain('mutation RemoveRunoffVote($battleId: ID!)')
    expect(text).toContain('removeRunoffVote(battleId: $battleId)')
  })

  it('GET_BATTLE selects the full runoff, with the viewer fields and the entry to play', () => {
    expect(flat(GET_BATTLE)).toContain(
      'runoff { status opensAt endsAt viewerVoteSubmissionId viewerCanVote candidates { votes submission { id videoUrl user { id username name image } } } }',
    )
  })

  it.each(listDocuments)('%s selects only the light runoff shape', (_name, doc) => {
    const text = flat(doc)
    expect(text).toContain(
      'runoff { status endsAt candidates { submission { user { id username name } } votes } }',
    )
  })

  it.each(listDocuments)('%s does not select the viewer fields or heavy submission fields', (_name, doc) => {
    const text = flat(doc)
    const start = text.indexOf('runoff {')
    expect(start).toBeGreaterThan(-1)
    const runoffText = text.slice(start)
    expect(text).not.toContain('viewerCanVote')
    expect(text).not.toContain('viewerVoteSubmissionId')
    expect(runoffText).not.toContain('opensAt')
    expect(runoffText).not.toContain('videoUrl')
  })

  it('RUNOFF_FIELDS can be spliced into a valid document', () => {
    const doc = gql`
      query Spliced {
        battles {
          id
          runoff { ${runoff.RUNOFF_FIELDS} }
        }
      }
    `
    expect(validate(schema, doc).map((e) => e.message)).toEqual([])
  })

  it('rejects an invalid runoff selection (the validation bites)', () => {
    const bad = gql`
      query Bad {
        battles {
          runoff { notAField }
        }
      }
    `
    expect(validate(schema, bad).length).toBeGreaterThan(0)
  })
})
