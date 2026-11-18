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
    expect(errorsFor('{ user(id: "x") { id username name image externalCrews battlesWon } }')).toEqual([])
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
      rows { id username name image email role status suspendedUntil suspensionReason crews entries battlesWon votesCast votesReceived ideasPosted createdAt lastSignInAt }
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
      'votesCast', 'votesReceived', 'ideasPosted', 'createdAt', 'lastSignInAt', 'email',
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
      // Added on purpose: a win count is public once battles complete, like Submission.voteCount.
      // It never counts open battles, and reveals no voter.
      battlesWon: 'Int!',
      // Added on purpose: wins, podiums, streaks and entries, from COMPLETED battles only (the
      // same public facts as battlesWon, broken down). No voter identity, no open-battle votes.
      record: 'UserRecord!',
      createdAt: 'String!',
    })
  })

  it('UserRecord and Champion expose only results, never a voter or a private field', () => {
    expect(fieldTypes('UserRecord')).toEqual({
      wins: 'Int!',
      podiums: 'Int!',
      bestFinish: 'Int',
      currentStreak: 'Int!',
      bestStreak: 'Int!',
      battlesEntered: 'Int!',
    })
    expect(fieldTypes('Champion')).toEqual({
      rank: 'Int!',
      user: 'User!',
      wins: 'Int!',
      battlesEntered: 'Int!',
      lastWinAt: 'String!',
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

describe('suggestions board schema privacy', () => {
  const fieldsOf = (name: string) => Object.keys(fieldTypes(name))
  const values = (name: string) => {
    const t = schema.getType(name)
    return t && 'getValues' in t ? t.getValues().map((v) => v.name) : []
  }

  // Exact lists on purpose, like User and Vote above: board voting is secret, so a later
  // votes/voters/userId/email field must fail here and be a deliberate decision.
  it('Idea has exactly the public fields: never who voted, never a user id or email', () => {
    expect(fieldTypes('Idea')).toEqual({
      id: 'ID!',
      title: 'String!',
      body: 'String!',
      category: 'IdeaCategory!',
      topic: 'IdeaTopic',
      status: 'IdeaStatus!',
      hidden: 'Boolean!',
      author: 'User!',
      voteCount: 'Int!',
      commentCount: 'Int!',
      viewerHasVoted: 'Boolean!',
      comments: '[IdeaComment!]!',
      createdAt: 'String!',
    })
  })

  it('documents the Idea.comments cap, order and admin-only hidden comments', () => {
    const idea = schema.getType('Idea')
    const description = idea && 'getFields' in idea ? idea.getFields().comments.description : undefined
    expect(description).toContain('at most the first 200 comments, oldest first')
    expect(description).toContain('Admins also receive hidden comments, marked `hidden: true`')
    expect(description).toContain('everyone else never receives them')
  })

  it('IdeaComment has exactly the public fields: never who voted, never a user id or email', () => {
    expect(fieldTypes('IdeaComment')).toEqual({
      id: 'ID!',
      ideaId: 'ID!',
      body: 'String!',
      hidden: 'Boolean!',
      author: 'User!',
      voteCount: 'Int!',
      viewerHasVoted: 'Boolean!',
      createdAt: 'String!',
    })
  })

  it('Idea and IdeaComment have no votes, voters, userId or email field', () => {
    for (const type of ['Idea', 'IdeaComment']) {
      for (const name of ['votes', 'voters', 'userId', 'email']) {
        expect(fieldsOf(type)).not.toContain(name)
      }
    }
  })

  it('authors are the public User type, never AdminUser', () => {
    expect(fieldTypes('Idea').author).toBe('User!')
    expect(fieldTypes('IdeaComment').author).toBe('User!')
  })

  it('allows the public idea list fields the board uses', () => {
    expect(errorsFor('{ ideas { rows { id title voteCount viewerHasVoted author { id username } } } }')).toEqual([])
  })

  it('rejects reading an author email or listing voters through the board', () => {
    expect(errorsFor('{ ideas { rows { author { email } } } }').some((m) => m.includes('Cannot query field "email"'))).toBe(true)
    expect(errorsFor('{ ideas { rows { votes { id } } } }').length).toBeGreaterThan(0)
    expect(errorsFor('{ idea(id: "x") { comments { voters { id } } } }').length).toBeGreaterThan(0)
  })

  it('IdeaPage has exactly the paging fields', () => {
    expect(fieldTypes('IdeaPage')).toEqual({
      rows: '[Idea!]!',
      total: 'Int!',
      page: 'Int!',
      pageCount: 'Int!',
    })
  })

  it('defines the board enums with exactly the expected values', () => {
    expect(values('IdeaCategory')).toEqual(['BUG', 'SUGGESTION', 'OTHER'])
    expect(values('IdeaTopic')).toEqual(['BATTLES', 'VOTING', 'PROFILES', 'LOGIN_ACCOUNT', 'SITE_WIDE'])
    expect(values('IdeaStatus')).toEqual(['OPEN', 'PLANNED', 'IN_PROGRESS', 'DONE', 'DECLINED'])
    expect(values('IdeaSort')).toEqual(['VOTES', 'NEWEST'])
  })

  it('ideas has the documented arguments and defaults', () => {
    const field = schema.getQueryType()!.getFields().ideas
    expect(field).toBeDefined()
    expect(String(field.type)).toBe('IdeaPage!')
    expect(field.args.map((a) => a.name).sort()).toEqual(
      ['category', 'includeHidden', 'page', 'pageSize', 'sort', 'status', 'topic'],
    )
    const defaults = Object.fromEntries(field.args.map((a) => [a.name, a.defaultValue]))
    expect(defaults).toMatchObject({ sort: 'VOTES', includeHidden: false, page: 1, pageSize: 20 })
    expect(String(schema.getQueryType()!.getFields().idea.type)).toBe('Idea')
  })

  it('defines the board mutations with the documented return types', () => {
    const m = schema.getMutationType()!.getFields()
    const returns = Object.fromEntries(
      [
        'createIdea', 'deleteIdea', 'voteIdea', 'unvoteIdea', 'createComment', 'deleteComment',
        'voteComment', 'unvoteComment', 'adminSetIdeaStatus', 'adminHideIdea', 'adminUnhideIdea',
        'adminDeleteIdea', 'adminHideComment', 'adminUnhideComment', 'adminDeleteComment',
      ].map((name) => [name, m[name] ? String(m[name].type) : undefined]),
    )
    expect(returns).toEqual({
      createIdea: 'Idea!',
      deleteIdea: 'Boolean!',
      voteIdea: 'Idea!',
      unvoteIdea: 'Idea!',
      createComment: 'IdeaComment!',
      deleteComment: 'Boolean!',
      voteComment: 'IdeaComment!',
      unvoteComment: 'IdeaComment!',
      adminSetIdeaStatus: 'Idea!',
      adminHideIdea: 'Idea!',
      adminUnhideIdea: 'Idea!',
      adminDeleteIdea: 'Boolean!',
      adminHideComment: 'IdeaComment!',
      adminUnhideComment: 'IdeaComment!',
      adminDeleteComment: 'Boolean!',
    })
  })

  it('board mutations return non-identifying fields only', () => {
    expect(errorsFor('mutation { voteIdea(ideaId: "x") { id voteCount viewerHasVoted } }')).toEqual([])
    expect(errorsFor('mutation { voteComment(commentId: "x") { id voteCount viewerHasVoted } }')).toEqual([])
    expect(errorsFor('mutation { createIdea(title: "t", body: "b", category: BUG) { id } }')).toEqual([])
  })
})


describe('winners and Hall of Fame schema', () => {
  it('validates the documents the client will send', () => {
    expect(errorsFor('{ battles { id status winningVotes winners { id username name image } } }')).toEqual([])
    expect(errorsFor('{ hallOfFame { rank wins battlesEntered lastWinAt user { id username name image } } }')).toEqual([])
    expect(
      errorsFor('{ user(id: "x") { battlesWon record { wins podiums bestFinish currentStreak bestStreak battlesEntered } } }'),
    ).toEqual([])
  })

  it('keeps winners and champions free of private fields and of voter identities', () => {
    expect(errorsFor('{ battles { winners { email } } }').length).toBeGreaterThan(0)
    expect(errorsFor('{ hallOfFame { user { email } } }').length).toBeGreaterThan(0)
    expect(errorsFor('{ hallOfFame { votes { userId } } }').length).toBeGreaterThan(0)
    expect(errorsFor('{ user(id: "x") { record { votes } } }').length).toBeGreaterThan(0)
  })

  it('types the new fields as documented', () => {
    const q = schema.getQueryType()!.getFields()
    expect(String(q.hallOfFame.type)).toBe('[Champion!]!')
    const record = schema.getType('UserRecord')
    const fields = record && 'getFields' in record ? record.getFields() : {}
    expect(String(fields.bestFinish.type)).toBe('Int') // null when the user never placed
    expect(String(fields.wins.type)).toBe('Int!')
  })

  it('pins the Battle runoff field and the Runoff types', () => {
    const fieldsOf = (name: string) => {
      const t = schema.getType(name)
      return t && 'getFields' in t
        ? Object.fromEntries(Object.entries(t.getFields()).map(([k, f]) => [k, String(f.type)]))
        : {}
    }
    expect(fieldsOf('Battle').runoff).toBe('Runoff')
    expect(fieldsOf('Runoff')).toEqual({
      status: 'RunoffStatus!',
      opensAt: 'String!',
      endsAt: 'String!',
      candidates: '[RunoffCandidate!]!',
      viewerVoteSubmissionId: 'ID',
      viewerCanVote: 'Boolean!',
    })
    // votes is nullable: null while the runoff is open.
    expect(fieldsOf('RunoffCandidate')).toEqual({ submission: 'Submission!', votes: 'Int' })
    const status = schema.getType('RunoffStatus')
    expect(status && 'getValues' in status ? status.getValues().map((v) => v.name) : []).toEqual(['OPEN', 'DECIDED', 'TIED'])
  })

  it('validates the runoff documents the client will send and keeps voters out of them', () => {
    expect(
      errorsFor(
        '{ battles { id runoff { status opensAt endsAt viewerVoteSubmissionId viewerCanVote candidates { votes submission { id videoUrl user { id username } } } } } }',
      ),
    ).toEqual([])
    expect(errorsFor('{ battles { runoff { voters { id } } } }').length).toBeGreaterThan(0)
    expect(errorsFor('{ battles { runoff { candidates { userId } } } }').length).toBeGreaterThan(0)
    expect(errorsFor('{ battles { runoff { candidates { voters { id } } } } }').length).toBeGreaterThan(0)
  })

  it('defines the runoff mutations with the documented arguments and return types', () => {
    const m = schema.getMutationType()!.getFields()
    expect(String(m.castRunoffVote.type)).toBe('Boolean!')
    expect(m.castRunoffVote.args.map((a) => `${a.name}: ${a.type}`)).toEqual(['submissionId: ID!'])
    expect(String(m.removeRunoffVote.type)).toBe('Boolean!')
    expect(m.removeRunoffVote.args.map((a) => `${a.name}: ${a.type}`)).toEqual(['battleId: ID!'])
  })
})
