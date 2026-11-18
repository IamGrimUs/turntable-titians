import { describe, expect, it } from 'vitest'
import { print, validate } from 'graphql'
import { GET_USER } from './user-profile'
import { loadServerSchema } from '../test-support/server-sdl'

const schema = loadServerSchema()

describe('GET_USER against the server SDL', () => {
  it('is valid', () => {
    expect(validate(schema, GET_USER).map((e) => e.message)).toEqual([])
  })

  it('asks for the record behind the trophy shelf', () => {
    const text = print(GET_USER)
    for (const field of ['record', 'podiums', 'bestFinish', 'currentStreak', 'bestStreak', 'battlesEntered']) {
      expect(text).toContain(field)
    }
  })

  it('selects no email or voter field', () => {
    const text = print(GET_USER)
    expect(text).not.toContain('email')
    expect(text).not.toContain('voters')
  })
})
