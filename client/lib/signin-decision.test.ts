import { describe, expect, it } from 'vitest'
import { decideSignIn } from './signin-decision'

const NOW = new Date('2026-11-15T12:00:00Z')

describe('decideSignIn', () => {
  it('allows a new sign-up (no user row, email not blocked)', () => {
    expect(decideSignIn({ user: null, emailBlocked: false, now: NOW })).toEqual({ allow: true })
  })

  it('allows a normal existing user', () => {
    const user = { id: 'u1', suspendedAt: null, suspendedUntil: null }
    expect(decideSignIn({ user, emailBlocked: false, now: NOW })).toEqual({ allow: true })
  })

  it('blocks a blocked email, even for a new user', () => {
    expect(decideSignIn({ user: null, emailBlocked: true, now: NOW })).toEqual({
      allow: false,
      reason: 'BLOCKED',
    })
  })

  it('lets a blocked email win over a suspension', () => {
    const user = { id: 'u1', suspendedAt: new Date('2026-11-01'), suspendedUntil: null }
    expect(decideSignIn({ user, emailBlocked: true, now: NOW })).toEqual({ allow: false, reason: 'BLOCKED' })
  })

  it('refuses a user who is suspended now and returns the id', () => {
    const user = { id: 'u1', suspendedAt: new Date('2026-11-01'), suspendedUntil: new Date('2026-12-01') }
    expect(decideSignIn({ user, emailBlocked: false, now: NOW })).toEqual({
      allow: false,
      reason: 'SUSPENDED',
      userId: 'u1',
    })
  })

  it('allows a user whose suspension has expired', () => {
    const user = { id: 'u1', suspendedAt: new Date('2026-11-01'), suspendedUntil: new Date('2026-11-10') }
    expect(decideSignIn({ user, emailBlocked: false, now: NOW })).toEqual({ allow: true })
  })
})
