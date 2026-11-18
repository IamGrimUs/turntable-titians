import { describe, expect, it } from 'vitest'
import { gql } from '@apollo/client'
import { print, validate, type DocumentNode } from 'graphql'
import * as hallOfFame from './hall-of-fame'
import { GET_BATTLES } from './queries'
import { loadServerSchema } from '../test-support/server-sdl'

const schema = loadServerSchema()
const documents = Object.entries(hallOfFame).filter(
  (entry): entry is [string, DocumentNode] => (entry[1] as DocumentNode | undefined)?.kind === 'Document',
)

describe('Hall of Fame documents against the server SDL', () => {
  it('exports every expected document', () => {
    expect(documents.map(([name]) => name).sort()).toEqual(
      ['GET_BATTLE_RESULTS', 'GET_HALL_OF_FAME', 'GET_LATEST_CHAMPIONS'],
    )
  })

  it.each(documents)('%s is valid', (_name, doc) => {
    expect(validate(schema, doc).map((e) => e.message)).toEqual([])
  })

  it.each(documents)('%s selects no email or voter field', (_name, doc) => {
    const text = print(doc)
    expect(text).not.toContain('email')
    expect(text).not.toContain('voters')
    expect(text).not.toContain('votes {')
  })

  it('never asks for voteCount per submission (two queries each on the server)', () => {
    for (const [, doc] of documents) expect(print(doc)).not.toContain('voteCount')
  })

  it('GET_BATTLES now also selects winners for the battle cards, and is still valid', () => {
    expect(print(GET_BATTLES)).toContain('winners')
    expect(validate(schema, GET_BATTLES).map((e) => e.message)).toEqual([])
  })

  it('rejects an invalid document (the validation bites)', () => {
    const bad = gql`
      query Bad {
        hallOfFame {
          user {
            email
          }
        }
      }
    `
    expect(validate(schema, bad).length).toBeGreaterThan(0)
  })
})
