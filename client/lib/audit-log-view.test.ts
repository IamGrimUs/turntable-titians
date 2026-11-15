import { describe, it, expect } from 'vitest'
import {
  actionLabel,
  actionTone,
  formatAuditTime,
  MAX_SUMMARY_LENGTH,
  parseDetails,
  partyLabel,
  summarizeDetails,
} from './audit-log-view'

const json = (value: unknown) => JSON.stringify(value)

describe('actionLabel', () => {
  it('labels every known action', () => {
    expect(actionLabel('USER_EDIT')).toBe('Edited user')
    expect(actionLabel('USER_SUSPEND')).toBe('Suspended user')
    expect(actionLabel('USER_REINSTATE')).toBe('Reinstated user')
    expect(actionLabel('USER_DELETE')).toBe('Deleted user')
    expect(actionLabel('EMAIL_BLOCK')).toBe('Blocked email')
    expect(actionLabel('ROLE_GRANT')).toBe('Made admin')
    expect(actionLabel('ROLE_REVOKE')).toBe('Removed admin')
  })
  it('falls back to the raw string for an unknown action', () => {
    expect(actionLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW')
  })
  it('does not treat object prototype names as known actions', () => {
    expect(actionLabel('constructor')).toBe('constructor')
    expect(actionTone('toString')).toBe('neutral')
  })
})

describe('actionTone', () => {
  it('flags destructive actions', () => {
    expect(actionTone('USER_DELETE')).toBe('danger')
    expect(actionTone('USER_REINSTATE')).toBe('good')
    expect(actionTone('nope')).toBe('neutral')
  })
})

describe('partyLabel', () => {
  it('prefers the username', () => {
    expect(partyLabel('dj_fox', 'fox@x.test')).toBe('dj_fox')
  })
  it('falls back to the email when the username is null or blank', () => {
    expect(partyLabel(null, 'fox@x.test')).toBe('fox@x.test')
    expect(partyLabel('  ', 'fox@x.test')).toBe('fox@x.test')
    expect(partyLabel(undefined, 'fox@x.test')).toBe('fox@x.test')
  })
  it('shows a dash when there is nothing', () => {
    expect(partyLabel(null, null)).toBe('—')
  })
})

describe('parseDetails', () => {
  it('parses an object', () => {
    expect(parseDetails('{"a":1}')).toEqual({ a: 1 })
  })
  it('returns null for malformed, non-object or empty input', () => {
    expect(parseDetails('{oops')).toBeNull()
    expect(parseDetails('')).toBeNull()
    expect(parseDetails('null')).toBeNull()
    expect(parseDetails('[1,2]')).toBeNull()
    expect(parseDetails('"text"')).toBeNull()
    expect(parseDetails('42')).toBeNull()
    expect(parseDetails(undefined)).toBeNull()
    expect(parseDetails(null)).toBeNull()
    expect(parseDetails({ a: 1 })).toBeNull()
  })
})

describe('formatAuditTime', () => {
  it('shows date and time', () => {
    expect(formatAuditTime('2026-11-15T14:05:00.000Z', 'UTC')).toBe('Nov 15, 2026, 2:05 PM')
  })
  it('shows a dash for an invalid date', () => {
    expect(formatAuditTime('nope')).toBe('—')
  })
})

describe('summarizeDetails: USER_EDIT', () => {
  it('lists changed fields', () => {
    const raw = json({
      changes: {
        username: { from: 'old_dj', to: 'new_dj' },
        name: { from: null, to: 'Fox' },
      },
    })
    expect(summarizeDetails('USER_EDIT', raw)).toBe('username: old_dj → new_dj; name: none → Fox')
  })
  it('joins crews and never prints an avatar address', () => {
    const raw = json({
      changes: {
        externalCrews: { from: ['A', 'B'], to: [] },
        image: { from: 'https://cdn.x.test/avatars/secret.png', to: null },
      },
    })
    const out = summarizeDetails('USER_EDIT', raw)
    expect(out).toBe('crews: A, B → none; avatar: removed')
    expect(out).not.toContain('http')
  })
  it('truncates long values', () => {
    const out = summarizeDetails('USER_EDIT', json({ changes: { name: { from: 'x', to: 'y'.repeat(500) } } }))
    expect(out.length).toBeLessThan(80)
    expect(out).toContain('…')
  })
  it('shows nothing for odd shapes', () => {
    expect(summarizeDetails('USER_EDIT', json({}))).toBe('')
    expect(summarizeDetails('USER_EDIT', json({ changes: 'x' }))).toBe('')
    expect(summarizeDetails('USER_EDIT', json({ changes: { name: 'x' } }))).toBe('')
    expect(summarizeDetails('USER_EDIT', json({ changes: { name: { from: { a: 1 }, to: 'z' } } }))).toBe('name: ? → z')
  })
  it('caps the whole summary', () => {
    const changes = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`field${i}`, { from: 'a'.repeat(30), to: 'b'.repeat(30) }])
    )
    expect(summarizeDetails('USER_EDIT', json({ changes })).length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH)
  })
})

describe('summarizeDetails: suspension', () => {
  it('shows reason and until', () => {
    const raw = json({ reason: 'Spamming battles', until: '2026-12-01T00:00:00.000Z' })
    expect(summarizeDetails('USER_SUSPEND', raw, 'UTC')).toBe('Reason: Spamming battles. Until: Dec 1, 2026, 12:00 AM')
  })
  it('handles no end date', () => {
    expect(summarizeDetails('USER_SUSPEND', json({ reason: 'Bad', until: null }))).toBe('Reason: Bad. Until: no end date')
  })
  it('truncates a long reason', () => {
    const out = summarizeDetails('USER_SUSPEND', json({ reason: 'r'.repeat(1000), until: null }))
    expect(out.length).toBeLessThan(180)
    expect(out).toContain('…')
  })
  it('collapses whitespace and newlines in a reason', () => {
    expect(summarizeDetails('USER_SUSPEND', json({ reason: 'a\n\n  b', until: null }))).toBe('Reason: a b. Until: no end date')
  })
  it('shows nothing when neither key is there', () => {
    expect(summarizeDetails('USER_SUSPEND', json({ other: 1 }))).toBe('')
  })
  it('reinstate shows what was lifted', () => {
    const raw = json({ previousReason: 'Spam', previousUntil: '2026-12-01T00:00:00.000Z' })
    expect(summarizeDetails('USER_REINSTATE', raw, 'UTC')).toBe(
      'Was suspended. Reason: Spam. Until: Dec 1, 2026, 12:00 AM'
    )
    expect(summarizeDetails('USER_REINSTATE', json({ previousReason: null, previousUntil: null }))).toBe(
      'Was suspended. Reason: none. Until: no end date'
    )
    expect(summarizeDetails('USER_REINSTATE', json({}))).toBe('')
  })
})

describe('summarizeDetails: delete, block and roles', () => {
  it('delete lists the counts', () => {
    const raw = json({ entries: 3, votesCast: 5, votesReceived: 12, emailBlocked: false })
    expect(summarizeDetails('USER_DELETE', raw)).toBe('Removed 3 entries, 5 votes cast, 12 votes received')
  })
  it('delete handles singular counts and a blocked email', () => {
    const raw = json({ entries: 1, votesCast: 1, votesReceived: 0, emailBlocked: true })
    expect(summarizeDetails('USER_DELETE', raw)).toBe(
      'Removed 1 entry, 1 vote cast, 0 votes received. Email blocked'
    )
  })
  it('delete ignores bad counts', () => {
    expect(summarizeDetails('USER_DELETE', json({ entries: 'x', votesCast: -1, votesReceived: null }))).toBe('')
    expect(summarizeDetails('USER_DELETE', json({ entries: 2 }))).toBe('Removed 2 entries')
  })
  it('email block has a fixed note and ignores details', () => {
    expect(summarizeDetails('EMAIL_BLOCK', '{}')).toBe('Email can no longer sign in')
    expect(summarizeDetails('EMAIL_BLOCK', '{broken')).toBe('Email can no longer sign in')
  })
  it('roles show from and to', () => {
    expect(summarizeDetails('ROLE_GRANT', json({ from: 'USER', to: 'ADMIN' }))).toBe('USER → ADMIN')
    expect(summarizeDetails('ROLE_REVOKE', json({ from: 'ADMIN', to: 'USER' }))).toBe('ADMIN → USER')
    expect(summarizeDetails('ROLE_GRANT', json({ from: 'USER' }))).toBe('')
    expect(summarizeDetails('ROLE_GRANT', json({ from: 1, to: 2 }))).toBe('')
  })
})

describe('summarizeDetails: unknown or broken input', () => {
  it('shows nothing for an unknown action, never raw JSON', () => {
    expect(summarizeDetails('SOMETHING_NEW', json({ secret: 'x' }))).toBe('')
  })
  it('shows nothing for malformed or odd JSON', () => {
    for (const action of ['USER_EDIT', 'USER_SUSPEND', 'USER_REINSTATE', 'USER_DELETE', 'ROLE_GRANT']) {
      expect(summarizeDetails(action, '{oops')).toBe('')
      expect(summarizeDetails(action, 'null')).toBe('')
      expect(summarizeDetails(action, '[]')).toBe('')
      expect(summarizeDetails(action, '')).toBe('')
      expect(summarizeDetails(action, undefined)).toBe('')
    }
  })
})
