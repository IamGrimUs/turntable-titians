import { describe, it, expect } from 'vitest'
import {
  DIALOG_LIMITS,
  GENERIC_ERROR_MESSAGE,
  adminErrorMessage,
  addCrew,
  buildUpdateInput,
  deleteConfirmMatches,
  deleteConfirmTarget,
  editErrorField,
  flattenReason,
  formatLocalDateTime,
  internalCrewNames,
  shouldRefreshAfterFailure,
  suspendErrorField,
  suspendUntilToIso,
  toDateTimeLocalValue,
  userLabel,
  validateSuspendReason,
} from './admin-user-dialogs'

describe('DIALOG_LIMITS', () => {
  it('mirrors the server limits', () => {
    expect(DIALOG_LIMITS).toEqual({ username: 30, displayName: 60, suspensionReason: 500, crewName: 40, maxCrews: 10 })
  })
})

describe('adminErrorMessage', () => {
  const gql = (code: string, message: string) => ({ graphQLErrors: [{ message, extensions: { code } }] })

  it('shows the server message for user-safe codes', () => {
    for (const code of ['BAD_USER_INPUT', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED', 'UNAUTHENTICATED']) {
      expect(adminErrorMessage(gql(code, 'Username already taken'))).toBe('Username already taken')
    }
  })
  it('hides everything else behind the generic message', () => {
    expect(adminErrorMessage(gql('INTERNAL_SERVER_ERROR', 'prisma exploded'))).toBe(GENERIC_ERROR_MESSAGE)
    expect(adminErrorMessage(new Error('Failed to fetch'))).toBe(GENERIC_ERROR_MESSAGE)
    expect(adminErrorMessage({ graphQLErrors: [] })).toBe(GENERIC_ERROR_MESSAGE)
    expect(adminErrorMessage(null)).toBe(GENERIC_ERROR_MESSAGE)
    expect(adminErrorMessage(undefined)).toBe(GENERIC_ERROR_MESSAGE)
  })
  it('shows the server rate-limit message', () => {
    const message = 'You are doing that too often. Please slow down and try again shortly.'
    expect(adminErrorMessage(gql('RATE_LIMITED', message))).toBe(message)
  })
  it('does not trust a safe code with no message', () => {
    expect(adminErrorMessage({ graphQLErrors: [{ message: '', extensions: { code: 'BAD_USER_INPUT' } }] })).toBe(
      GENERIC_ERROR_MESSAGE,
    )
  })
  it('uses the first safe error when there are several', () => {
    expect(
      adminErrorMessage({
        graphQLErrors: [
          { message: 'internal', extensions: { code: 'INTERNAL_SERVER_ERROR' } },
          { message: 'User not found', extensions: { code: 'NOT_FOUND' } },
        ],
      }),
    ).toBe('User not found')
  })
})

describe('shouldRefreshAfterFailure', () => {
  const gql = (code: string) => ({ graphQLErrors: [{ message: 'm', extensions: { code } }] })

  it('refreshes when the user is gone or changed under the admin', () => {
    expect(shouldRefreshAfterFailure(gql('NOT_FOUND'), false)).toBe(true)
    expect(shouldRefreshAfterFailure(gql('FORBIDDEN'), false)).toBe(true)
    expect(shouldRefreshAfterFailure(gql('NOT_FOUND'), true)).toBe(true)
  })
  it('does not refresh while the admin is fixing the form', () => {
    expect(shouldRefreshAfterFailure(gql('BAD_USER_INPUT'), false)).toBe(false)
    expect(shouldRefreshAfterFailure(gql('BAD_USER_INPUT'), true)).toBe(false)
    expect(shouldRefreshAfterFailure(gql('RATE_LIMITED'), true)).toBe(false)
  })
  it('refreshes after a delete whose response was lost, but not other network failures', () => {
    const network = { graphQLErrors: [], networkError: new Error('Failed to fetch') }
    expect(shouldRefreshAfterFailure(network, true)).toBe(true)
    expect(shouldRefreshAfterFailure(new Error('Failed to fetch'), true)).toBe(true)
    expect(shouldRefreshAfterFailure(network, false)).toBe(false)
  })
  it('refreshes when any of several errors qualifies', () => {
    expect(
      shouldRefreshAfterFailure(
        { graphQLErrors: [{ extensions: { code: 'BAD_USER_INPUT' } }, { extensions: { code: 'NOT_FOUND' } }] },
        false,
      ),
    ).toBe(true)
  })
  it('tolerates junk', () => {
    expect(shouldRefreshAfterFailure(null, false)).toBe(false)
    expect(shouldRefreshAfterFailure(undefined, true)).toBe(true)
  })
})

describe('suspendErrorField', () => {
  it('finds the field a message is about', () => {
    expect(suspendErrorField('Enter a reason for the suspension.')).toBe('reason')
    expect(suspendErrorField('The reason must be 500 characters or fewer.')).toBe('reason')
    expect(suspendErrorField('Reason is required.')).toBe('reason')
    expect(suspendErrorField('The end date must be in the future.')).toBe('until')
    expect(suspendErrorField('Enter a valid end date.')).toBe('until')
  })
  it('is null for no message or a message about the whole form', () => {
    expect(suspendErrorField(null)).toBeNull()
    expect(suspendErrorField(GENERIC_ERROR_MESSAGE)).toBeNull()
  })
})

describe('editErrorField', () => {
  it('finds the field a message is about', () => {
    expect(editErrorField('Username already taken')).toBe('username')
    expect(editErrorField('That username is not available.')).toBe('username')
    expect(editErrorField('Usernames must be 3-30 characters and can only use letters.')).toBe('username')
    expect(editErrorField('Name must be 60 characters or fewer.')).toBe('name')
    expect(editErrorField('You can list up to 10 crews.')).toBe('crew')
  })
  it('is null for no message or a message about the whole form', () => {
    expect(editErrorField(null)).toBeNull()
    expect(editErrorField(GENERIC_ERROR_MESSAGE)).toBeNull()
    expect(editErrorField('That user no longer exists.')).toBeNull()
  })
})

describe('delete confirmation', () => {
  const named = { username: 'DJ_Fox', email: 'fox@example.com' }
  const unnamed = { username: null, email: 'New.Person@Example.com' }

  it('targets the username, else the email', () => {
    expect(deleteConfirmTarget(named)).toBe('DJ_Fox')
    expect(deleteConfirmTarget(unnamed)).toBe('New.Person@Example.com')
    expect(userLabel(named)).toBe('DJ_Fox')
  })
  it('matches a username exactly, ignoring surrounding spaces, case-sensitively', () => {
    expect(deleteConfirmMatches('DJ_Fox', named)).toBe(true)
    expect(deleteConfirmMatches('  DJ_Fox  ', named)).toBe(true)
    expect(deleteConfirmMatches('dj_fox', named)).toBe(false)
    expect(deleteConfirmMatches('DJ_Fo', named)).toBe(false)
    expect(deleteConfirmMatches('DJ_Foxx', named)).toBe(false)
  })
  it('does not accept the email when there is a username', () => {
    expect(deleteConfirmMatches('fox@example.com', named)).toBe(false)
  })
  it('matches the email (any case) when there is no username', () => {
    expect(deleteConfirmMatches('new.person@example.com', unnamed)).toBe(true)
    expect(deleteConfirmMatches(' New.Person@Example.com ', unnamed)).toBe(true)
    expect(deleteConfirmMatches('other@example.com', unnamed)).toBe(false)
  })
  it('never matches blank input', () => {
    expect(deleteConfirmMatches('', named)).toBe(false)
    expect(deleteConfirmMatches('   ', unnamed)).toBe(false)
  })
})

describe('suspend reason', () => {
  it('flattens line breaks to spaces', () => {
    expect(flattenReason('a\nb\r\nc\r\r\nd')).toBe('a b c d')
  })
  it('requires a non-blank reason', () => {
    expect(validateSuspendReason('')).not.toBeNull()
    expect(validateSuspendReason('   ')).not.toBeNull()
    expect(validateSuspendReason(' spam ')).toBeNull()
  })
  it('caps the length at 500', () => {
    expect(validateSuspendReason('x'.repeat(500))).toBeNull()
    expect(validateSuspendReason('x'.repeat(501))).not.toBeNull()
  })
})

describe('suspendUntilToIso', () => {
  const now = new Date(2026, 10, 15, 12, 0, 0) // local time

  it('blank means until reinstated', () => {
    expect(suspendUntilToIso('', now)).toEqual({ ok: true, until: null })
    expect(suspendUntilToIso('   ', now)).toEqual({ ok: true, until: null })
  })
  it('converts local time to an ISO instant', () => {
    const result = suspendUntilToIso('2026-11-20T15:30', now)
    expect(result).toEqual({ ok: true, until: new Date(2026, 10, 20, 15, 30).toISOString() })
  })
  it('refuses a past or current time', () => {
    expect(suspendUntilToIso('2026-11-14T10:00', now).ok).toBe(false)
    expect(suspendUntilToIso('2026-11-15T12:00', now).ok).toBe(false)
  })
  it('refuses nonsense', () => {
    expect(suspendUntilToIso('not a date', now).ok).toBe(false)
    expect(suspendUntilToIso('2026-13-45T99:99', now).ok).toBe(false)
  })
})

describe('date formatting', () => {
  it('writes a datetime-local value in local time', () => {
    expect(toDateTimeLocalValue(new Date(2026, 0, 5, 7, 4))).toBe('2026-01-05T07:04')
  })
  it('round-trips through suspendUntilToIso', () => {
    const when = new Date(2027, 5, 1, 9, 30)
    const result = suspendUntilToIso(toDateTimeLocalValue(when), new Date(2026, 0, 1))
    expect(result).toEqual({ ok: true, until: when.toISOString() })
  })
  it('formats an ISO instant for people, and passes junk through', () => {
    expect(formatLocalDateTime(new Date(2026, 10, 20, 15, 30).toISOString())).toMatch(/Nov 20, 2026/)
    expect(formatLocalDateTime('nope')).toBe('nope')
  })
})

describe('buildUpdateInput', () => {
  const row = { username: 'dj_fox', name: 'Fox', image: 'https://img.example.com/a.png' }
  const base = { username: 'dj_fox', name: 'Fox', crews: ['A', 'B'], removeAvatar: false }

  it('returns null when nothing changed', () => {
    expect(buildUpdateInput(row, ['A', 'B'], base)).toBeNull()
    expect(buildUpdateInput(row, ['A', 'B'], { ...base, username: '  dj_fox ', name: ' Fox ' })).toBeNull()
  })
  it('sends only the username when only it changed', () => {
    expect(buildUpdateInput(row, ['A', 'B'], { ...base, username: ' new_name ' })).toEqual({ username: 'new_name' })
  })
  it('sends an emptied name as an empty string (clears it)', () => {
    expect(buildUpdateInput(row, ['A', 'B'], { ...base, name: '   ' })).toEqual({ name: '' })
  })
  it('does not send a blank name for a user with no name', () => {
    expect(buildUpdateInput({ ...row, name: null }, ['A', 'B'], { ...base, name: '' })).toBeNull()
  })
  it('sends a username only when it differs from none for a user without one', () => {
    expect(buildUpdateInput({ ...row, username: null }, ['A', 'B'], { ...base, username: '' })).toBeNull()
    expect(buildUpdateInput({ ...row, username: null }, ['A', 'B'], { ...base, username: 'abc' })).toEqual({
      username: 'abc',
    })
  })
  it('sends the whole crew list when it changed, including emptied', () => {
    expect(buildUpdateInput(row, ['A', 'B'], { ...base, crews: ['A', 'B', 'C'] })).toEqual({
      externalCrews: ['A', 'B', 'C'],
    })
    expect(buildUpdateInput(row, ['A', 'B'], { ...base, crews: [] })).toEqual({ externalCrews: [] })
    expect(buildUpdateInput(row, ['A', 'B'], { ...base, crews: ['B', 'A'] })).toEqual({ externalCrews: ['B', 'A'] })
  })
  it('never sends crews when the current list could not be loaded', () => {
    expect(buildUpdateInput(row, null, { ...base, crews: ['Z'] })).toBeNull()
  })
  it('sends removeAvatar only when ticked and there is an avatar', () => {
    expect(buildUpdateInput(row, ['A', 'B'], { ...base, removeAvatar: true })).toEqual({ removeAvatar: true })
    expect(buildUpdateInput({ ...row, image: null }, ['A', 'B'], { ...base, removeAvatar: true })).toBeNull()
  })
  it('combines several changes', () => {
    expect(
      buildUpdateInput(row, ['A', 'B'], { username: 'x_y', name: '', crews: ['A'], removeAvatar: true }),
    ).toEqual({ username: 'x_y', name: '', externalCrews: ['A'], removeAvatar: true })
  })
  it('never contains an email', () => {
    const input = buildUpdateInput(row, ['A', 'B'], { username: 'x_y', name: 'n', crews: [], removeAvatar: true })
    expect(Object.keys(input ?? {})).not.toContain('email')
  })
})

describe('addCrew', () => {
  it('adds a trimmed crew', () => {
    expect(addCrew(['A'], '  B  ')).toEqual({ ok: true, crews: ['A', 'B'] })
  })
  it('ignores blanks and case-insensitive duplicates', () => {
    expect(addCrew(['A'], '   ')).toEqual({ ok: true, crews: ['A'] })
    expect(addCrew(['The Allies'], 'the allies')).toEqual({ ok: true, crews: ['The Allies'] })
  })
  it('refuses a name over 40 characters', () => {
    expect(addCrew([], 'x'.repeat(41)).ok).toBe(false)
    expect(addCrew([], 'x'.repeat(40)).ok).toBe(true)
  })
  it('refuses an 11th crew', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `c${i}`)
    expect(addCrew(ten, 'extra').ok).toBe(false)
    expect(addCrew(ten.slice(0, 9), 'extra').ok).toBe(true)
  })
})

describe('internalCrewNames', () => {
  it('returns the crews that are not in the external list', () => {
    expect(internalCrewNames(['Core', 'The Allies', 'Wax'], ['the allies'])).toEqual(['Core', 'Wax'])
    expect(internalCrewNames([], [])).toEqual([])
  })
})
