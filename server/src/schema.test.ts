import { describe, it, expect } from 'vitest'
import { buildASTSchema, isObjectType, parse, validate } from 'graphql'
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

  it('keeps email, role, suspension reason and last sign-in off the public User type', () => {
    const userType = schema.getType('User')
    const fields = userType && 'getFields' in userType ? Object.keys(userType.getFields()) : []
    for (const name of ['email', 'role', 'suspensionReason', 'suspendedUntil', 'status', 'lastSignInAt']) {
      expect(fields).not.toContain(name)
    }
  })

  it('exposes the admin fields only on AdminUser, reachable only through adminUsers', () => {
    expect(errorsFor('{ adminUsers { rows { email role status suspensionReason lastSignInAt } } }')).toEqual([])
    expect(errorsFor('{ me { role } }').length).toBeGreaterThan(0)
    expect(errorsFor('{ me { lastSignInAt } }').length).toBeGreaterThan(0)
  })

  it('validates the full adminUsers query with every argument and the page fields', () => {
    const query = `{ adminUsers(search: "x", filter: ADMINS, sortKey: battlesWon, sortDir: ASC, page: 2, pageSize: 10) {
      total page pageCount counts { all active suspended admins }
      rows { id username name image email role status suspendedUntil suspensionReason crews entries battlesWon votesCast votesReceived createdAt lastSignInAt }
    } }`
    expect(errorsFor(query)).toEqual([])
  })

  it('uses the documented defaults for adminUsers arguments', () => {
    const field = schema.getQueryType()!.getFields().adminUsers
    const defaults = Object.fromEntries(field.args.map((a) => [a.name, a.defaultValue]))
    expect(defaults).toMatchObject({ filter: 'ALL', sortKey: 'createdAt', sortDir: 'DESC', page: 1, pageSize: 25 })
  })

  it('defines the admin enums with exactly the expected values', () => {
    const values = (name: string) => {
      const t = schema.getType(name)
      return t && 'getValues' in t ? t.getValues().map((v) => v.name) : []
    }
    expect(values('UserRole')).toEqual(['USER', 'ADMIN', 'OWNER'])
    expect(values('UserStatus')).toEqual(['ACTIVE', 'SUSPENDED'])
    expect(values('AdminUserFilter')).toEqual(['ALL', 'ACTIVE', 'SUSPENDED', 'ADMINS'])
    expect(values('SortDirection')).toEqual(['ASC', 'DESC'])
    expect(values('AdminUserSortKey')).toEqual([
      'role', 'username', 'crews', 'status', 'entries', 'battlesWon',
      'votesCast', 'votesReceived', 'createdAt', 'lastSignInAt', 'email',
    ])
  })

  it('adminUpdateUser takes exactly the documented arguments and has no email argument', () => {
    const field = schema.getMutationType()!.getFields().adminUpdateUser
    expect(field).toBeDefined()
    const names = field.args.map((a) => a.name)
    expect(names).not.toContain('email')
    expect(names.sort()).toEqual(['externalCrews', 'name', 'removeAvatar', 'userId', 'username'])
    expect(String(field.type)).toBe('AdminUser!')
  })
})

/** Name -> printed type of every field of an object type, in declaration order. */
function fieldTypes(name: string): Record<string, string> {
  const type = schema.getType(name)
  if (!isObjectType(type)) throw new Error(`${name} is not an object type in the schema`)
  return Object.fromEntries(Object.entries(type.getFields()).map(([field, def]) => [field, String(def.type)]))
}

describe('pinned public types', () => {
  // These two types are readable by anyone, signed in or not. The lists are exact on purpose: a
  // new field makes these tests fail, so adding one is a deliberate privacy decision, not an
  // accident. Private data belongs on AdminUser (reachable only through the admin queries).
  it('User has exactly the public profile fields: never email, role, suspension data or last sign-in', () => {
    // User.email is deliberately not exposed, and neither are role, suspendedAt, suspendedUntil,
    // suspensionReason, status or lastSignInAt. If you are adding a field here, ask whether
    // anyone on the internet should be able to read it; if not, it goes on AdminUser instead.
    expect(fieldTypes('User')).toEqual({
      id: 'ID!',
      username: 'String',
      name: 'String',
      image: 'String',
      externalCrews: '[String!]!',
      submissions: '[Submission!]!',
      createdAt: 'String!',
    })
  })

  it('Vote has exactly the non-identifying fields: voting is secret, so never a voter', () => {
    // Voting is secret. A Vote must not say who cast it (no userId, no user, no voter of any
    // kind); Submission.viewerHasVoted is the only per-viewer vote field, and it is about the caller.
    expect(fieldTypes('Vote')).toEqual({
      id: 'ID!',
      submissionId: 'ID!',
      battleId: 'ID!',
      createdAt: 'String!',
    })
  })
})

