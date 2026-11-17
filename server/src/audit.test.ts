import { describe, it, expect } from 'vitest'
import { buildASTSchema } from 'graphql'
import { auditData, diffFields } from './audit'
import { typeDefs } from './schema'

describe('auditData', () => {
  const actor = { id: 'actor-1', username: 'boss', email: 'boss@example.com' }
  const target = { id: 'target-1', username: 'dj_kid', email: 'kid@example.com' }

  it('copies actor and target id, username and email into the snapshot columns', () => {
    const data = auditData({ actor, action: 'USER_SUSPEND', target })
    expect(data).toMatchObject({
      actorId: 'actor-1',
      actorUsername: 'boss',
      actorEmail: 'boss@example.com',
      action: 'USER_SUSPEND',
      targetId: 'target-1',
      targetUsername: 'dj_kid',
      targetEmail: 'kid@example.com',
    })
  })

  it("sets targetType to 'USER'", () => {
    expect(auditData({ actor, action: 'USER_EDIT', target }).targetType).toBe('USER')
  })

  it('can target content: targetType and targetId override, author is still snapshotted', () => {
    const data = auditData({ actor, action: 'IDEA_HIDE', target, targetType: 'IDEA', targetId: 'i1' })
    expect(data).toMatchObject({
      action: 'IDEA_HIDE',
      targetType: 'IDEA',
      targetId: 'i1',
      targetUsername: 'dj_kid',
      targetEmail: 'kid@example.com',
    })
  })

  it('accepts COMMENT as a target type', () => {
    const data = auditData({ actor, action: 'COMMENT_DELETE', target, targetType: 'COMMENT', targetId: 'c1' })
    expect(data.targetType).toBe('COMMENT')
    expect(data.targetId).toBe('c1')
  })

  it('defaults targetType to USER and targetId to the target id when not given', () => {
    const data = auditData({ actor, action: 'USER_EDIT', target })
    expect(data.targetType).toBe('USER')
    expect(data.targetId).toBe('target-1')
  })

  it('defaults details to an empty object', () => {
    expect(auditData({ actor, action: 'USER_REINSTATE', target }).details).toEqual({})
  })

  it('passes details through when given', () => {
    const details = { reason: 'spam', until: '2026-12-01T00:00:00.000Z' }
    expect(auditData({ actor, action: 'USER_SUSPEND', target, details }).details).toEqual(details)
  })

  it('throws when the actor email is missing (fail closed)', () => {
    expect(() => auditData({ actor: { ...actor, email: undefined }, action: 'USER_EDIT', target })).toThrow(
      'audit: actor email missing',
    )
  })

  it('throws when the actor email is an empty string', () => {
    expect(() => auditData({ actor: { ...actor, email: '' }, action: 'USER_EDIT', target })).toThrow(
      'audit: actor email missing',
    )
  })

  it('keeps a missing username as-is (user who has not onboarded)', () => {
    const data = auditData({ actor, action: 'USER_DELETE', target: { id: 't', username: null, email: 't@example.com' } })
    expect(data.targetUsername).toBeNull()
  })
})

describe('diffFields', () => {
  it('returns only the keys whose value changed', () => {
    expect(diffFields({ bio: 'a', city: 'x' }, { bio: 'b', city: 'x' })).toEqual({
      bio: { from: 'a', to: 'b' },
    })
  })

  it('treats arrays with equal contents as unchanged', () => {
    expect(diffFields({ crews: ['a', 'b'] }, { crews: ['a', 'b'] })).toEqual({})
  })

  it('reports arrays whose contents differ', () => {
    expect(diffFields({ crews: ['a', 'b'] }, { crews: ['b', 'a'] })).toEqual({
      crews: { from: ['a', 'b'], to: ['b', 'a'] },
    })
    expect(diffFields({ crews: ['a'] }, { crews: ['a', 'b'] })).toEqual({
      crews: { from: ['a'], to: ['a', 'b'] },
    })
  })

  it('ignores a key that is only in before (not supplied is not cleared)', () => {
    expect(diffFields({ bio: 'x', city: 'y' }, { city: 'y' })).toEqual({})
    expect(diffFields({ bio: 'x' }, { bio: undefined })).toEqual({})
  })

  it('reports a value cleared to null', () => {
    expect(diffFields({ bio: 'x' }, { bio: null })).toEqual({ bio: { from: 'x', to: null } })
  })

  it('treats null to null as unchanged', () => {
    expect(diffFields({ bio: null }, { bio: null })).toEqual({})
  })

  it('reports a key that is only in after with a defined value', () => {
    expect(diffFields({}, { bio: 'new' })).toEqual({ bio: { from: undefined, to: 'new' } })
  })

  it('returns {} when nothing changed', () => {
    expect(diffFields({ bio: 'a', n: 1, x: null }, { bio: 'a', n: 1, x: null })).toEqual({})
  })
})

describe('audit log is append-only', () => {
  it('has no GraphQL mutation that writes to or deletes from the audit log', () => {
    const mutationType = buildASTSchema(typeDefs).getMutationType()
    const names = mutationType ? Object.keys(mutationType.getFields()) : []
    expect(names.filter((n) => n.startsWith('adminAuditLog') || n.startsWith('deleteAudit'))).toEqual([])
  })
})
