import { describe, expect, it } from 'vitest'
import { gql } from '@apollo/client'
import { print, validate, type DocumentNode } from 'graphql'
import * as board from './board'
import { loadServerSchema } from '../test-support/server-sdl'

const schema = loadServerSchema()
const documents = Object.entries(board).filter(
  (entry): entry is [string, DocumentNode] => (entry[1] as DocumentNode | undefined)?.kind === 'Document',
)

const EXPECTED = [
  'GET_IDEAS',
  'GET_IDEA',
  'CREATE_IDEA',
  'VOTE_IDEA',
  'UNVOTE_IDEA',
  'CREATE_COMMENT',
  'VOTE_COMMENT',
  'UNVOTE_COMMENT',
  'DELETE_IDEA',
  'DELETE_COMMENT',
  'ADMIN_SET_IDEA_STATUS',
  'ADMIN_HIDE_IDEA',
  'ADMIN_UNHIDE_IDEA',
  'ADMIN_DELETE_IDEA',
  'ADMIN_HIDE_COMMENT',
  'ADMIN_UNHIDE_COMMENT',
  'ADMIN_DELETE_COMMENT',
]

describe('board documents against the server SDL', () => {
  it('exports every expected document', () => {
    expect(documents.map(([name]) => name).sort()).toEqual([...EXPECTED].sort())
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

  it('the list query selects commentCount and not comments', () => {
    const text = print(board.GET_IDEAS)
    expect(text).toContain('commentCount')
    expect(text).not.toMatch(/\bcomments\b/)
  })

  it('the detail query selects comments with hidden and viewerHasVoted', () => {
    const text = print(board.GET_IDEA)
    expect(text).toMatch(/\bcomments\b/)
    expect(text).toContain('hidden')
    expect(text).toContain('viewerHasVoted')
  })

  it('rejects an invalid document (the validation bites)', () => {
    const bad = gql`
      query Bad {
        ideas {
          rows {
            email
          }
        }
      }
    `
    expect(validate(schema, bad).length).toBeGreaterThan(0)
  })
})
