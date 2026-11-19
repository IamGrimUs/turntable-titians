import { describe, expect, it } from 'vitest'
import { print, validate } from 'graphql'
import { SEARCH_USERS } from './user-search'
import { loadServerSchema } from '../test-support/server-sdl'

const schema = loadServerSchema()

describe('SEARCH_USERS against the server SDL', () => {
  it('is valid', () => {
    expect(validate(schema, SEARCH_USERS).map((e) => e.message)).toEqual([])
  })

  it('selects no email, role or suspension field', () => {
    const text = print(SEARCH_USERS)
    expect(text).not.toContain('email')
    expect(text).not.toContain('role')
    expect(text).not.toContain('suspend')
  })
})
