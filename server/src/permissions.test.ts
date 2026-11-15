import { describe, it, expect } from 'vitest'
import { GraphQLError } from 'graphql'
import { can, assertCan, type Role, type Actor, type Target } from './permissions'

const ROLES: Role[] = ['USER', 'ADMIN', 'OWNER']

function actor(role: Role): Actor {
  return { id: `actor-${role}`, role }
}

function target(role: Role): Target {
  return { id: `target-${role}`, role }
}

describe('can: viewAdmin', () => {
  it.each([
    ['USER', false],
    ['ADMIN', true],
    ['OWNER', true],
  ] as const)('%s -> %s', (role, expected) => {
    expect(can(actor(role), 'viewAdmin')).toBe(expected)
  })

  it('is false for a null actor', () => {
    expect(can(null, 'viewAdmin')).toBe(false)
  })
})

describe('can: manageUser', () => {
  it.each([
    ['ADMIN', 'USER', true],
    ['ADMIN', 'ADMIN', false],
    ['ADMIN', 'OWNER', false],
    ['OWNER', 'USER', true],
    ['OWNER', 'ADMIN', true],
    ['OWNER', 'OWNER', false],
    ['USER', 'USER', false],
    ['USER', 'ADMIN', false],
    ['USER', 'OWNER', false],
  ] as const)('%s acting on %s -> %s', (actorRole, targetRole, expected) => {
    expect(can(actor(actorRole), 'manageUser', target(targetRole))).toBe(expected)
  })

  it('is false for a null actor', () => {
    for (const role of ROLES) {
      expect(can(null, 'manageUser', target(role))).toBe(false)
    }
  })

  it('is false when there is no target', () => {
    for (const role of ROLES) {
      expect(can(actor(role), 'manageUser')).toBe(false)
    }
  })
})

describe('can: setRole', () => {
  it.each([
    ['OWNER', 'USER', true],
    ['OWNER', 'ADMIN', true],
    ['OWNER', 'OWNER', false],
    ['ADMIN', 'USER', false],
    ['ADMIN', 'ADMIN', false],
    ['ADMIN', 'OWNER', false],
    ['USER', 'USER', false],
    ['USER', 'ADMIN', false],
    ['USER', 'OWNER', false],
  ] as const)('%s acting on %s -> %s', (actorRole, targetRole, expected) => {
    expect(can(actor(actorRole), 'setRole', target(targetRole))).toBe(expected)
  })

  it('is false for a null actor', () => {
    for (const role of ROLES) {
      expect(can(null, 'setRole', target(role))).toBe(false)
    }
  })

  it('is false when there is no target', () => {
    for (const role of ROLES) {
      expect(can(actor(role), 'setRole')).toBe(false)
    }
  })
})

describe('can: viewAuditLog', () => {
  it.each([
    ['USER', false],
    ['ADMIN', false],
    ['OWNER', true],
  ] as const)('%s -> %s', (role, expected) => {
    expect(can(actor(role), 'viewAuditLog')).toBe(expected)
  })

  it('is false for a null actor', () => {
    expect(can(null, 'viewAuditLog')).toBe(false)
  })
})

describe('assertCan', () => {
  it('returns undefined when the action is allowed', () => {
    expect(assertCan(actor('OWNER'), 'viewAuditLog')).toBeUndefined()
  })

  it('throws a FORBIDDEN GraphQLError when the action is not allowed', () => {
    let thrown: unknown
    try {
      assertCan(actor('ADMIN'), 'viewAuditLog')
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(GraphQLError)
    const err = thrown as GraphQLError
    expect(err.extensions.code).toBe('FORBIDDEN')
    expect(err.message).toBe("You don't have permission to do that.")
  })

  it('throws for a null actor', () => {
    expect(() => assertCan(null, 'viewAdmin')).toThrow(GraphQLError)
  })

  it('passes the target through to can', () => {
    expect(() => assertCan(actor('ADMIN'), 'manageUser', target('USER'))).not.toThrow()
    expect(() => assertCan(actor('ADMIN'), 'manageUser', target('ADMIN'))).toThrow(GraphQLError)
  })
})
