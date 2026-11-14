import { describe, it, expect } from 'vitest'
import { buildASTSchema, parse, validate } from 'graphql'
import { typeDefs } from './schema'

const schema = buildASTSchema(typeDefs)

function errorsFor(query: string) {
  return validate(schema, parse(query)).map((e) => e.message)
}

describe('public GraphQL schema privacy', () => {
  it('does not expose User.email', () => {
    const userType = schema.getType('User')
    expect(userType && 'getFields' in userType ? Object.keys(userType.getFields()) : []).not.toContain('email')
  })

  it('rejects an unauthenticated-style query that tries to read a contestant email', () => {
    const errors = errorsFor('{ battles { submissions { user { email } } } }')
    expect(errors.some((m) => m.includes('Cannot query field "email"'))).toBe(true)
  })

  it('rejects reading email through the user(id) query', () => {
    const errors = errorsFor('{ user(id: "x") { email } }')
    expect(errors.some((m) => m.includes('Cannot query field "email"'))).toBe(true)
  })

  it('still allows the public profile fields the app uses', () => {
    expect(errorsFor('{ user(id: "x") { id username name image externalCrews } }')).toEqual([])
  })
})
