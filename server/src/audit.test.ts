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

  it('defaults details to an empty object', () => {
    expect(auditData({ actor, action: 'USER_REINSTATE', target }).details).toEqual({})
  })

  it('passes details through when given', () => {
    const details = { reason: 'spam', until: '2026-12-01T00:00:00.000Z' }
    expect(auditData({ actor, action: 'USER_SUSPEND', target, details }).details).toEqual(details)
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
