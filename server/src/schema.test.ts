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

  it('does not expose who voted: no Submission.votes and no Vote.userId', () => {
    const fieldsOf = (name: string) => {
      const t = schema.getType(name)
      return t && 'getFields' in t ? Object.keys(t.getFields()) : []
    }
    expect(fieldsOf('Submission')).not.toContain('votes')
    expect(fieldsOf('Vote')).not.toContain('userId')
  })

  it('rejects queries that list voters', () => {
    expect(errorsFor('{ submission(id: "x") { votes { userId } } }').length).toBeGreaterThan(0)
    expect(errorsFor('{ submission(id: "x") { votes { id } } }').length).toBeGreaterThan(0)
  })

  it('exposes only the caller\'s own vote status and the public count', () => {
    expect(errorsFor('{ submission(id: "x") { voteCount viewerHasVoted } }')).toEqual([])
  })

  it('still allows the vote mutation to return non-identifying fields', () => {
    expect(errorsFor('mutation { vote(submissionId: "x") { id submissionId battleId createdAt } }')).toEqual([])
  })

  it('still allows the public profile fields the app uses', () => {
    expect(errorsFor('{ user(id: "x") { id username name image externalCrews } }')).toEqual([])
  })
})
