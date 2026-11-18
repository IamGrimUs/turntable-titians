import { describe, expect, it } from 'vitest'
import { CHALLENGE_LIMITS, validateChallengeForm } from './challenge-view'
import {
  buildChallengeVariables,
  challengeErrorMessage,
  challengePath,
  firstErrorField,
  initialChallengeValues,
  prefillUsername,
  serverErrorField,
} from './challenge-form'

const GENERIC = 'Something went wrong. Please try again.'

function gqlError(code: string | undefined, message: string) {
  return { message, graphQLErrors: [{ message, extensions: code ? { code } : {} }] }
}

describe('prefillUsername', () => {
  it('takes the username from ?to=', () => {
    expect(prefillUsername('kay')).toBe('kay')
  })

  it('uses the first value when the parameter is repeated', () => {
    expect(prefillUsername(['kay', 'jo'])).toBe('kay')
  })

  it('trims, drops a leading @ and caps the length', () => {
    expect(prefillUsername('  @kay  ')).toBe('kay')
    expect(prefillUsername('a'.repeat(80))).toHaveLength(CHALLENGE_LIMITS.usernameMax)
  })

  it('strips control characters', () => {
    expect(prefillUsername('ka\u0000y\n')).toBe('kay')
  })

  it('is empty when there is nothing usable', () => {
    expect(prefillUsername(undefined)).toBe('')
    expect(prefillUsername('')).toBe('')
    expect(prefillUsername([])).toBe('')
    expect(prefillUsername('@')).toBe('')
  })
})

describe('initialChallengeValues', () => {
  it('starts empty with 7 voting days and the prefill', () => {
    expect(initialChallengeValues('kay')).toEqual({
      username: 'kay',
      title: '',
      message: '',
      videoUrl: '',
      votingDays: 7,
    })
  })

  it('the default voting length is one the server accepts', () => {
    expect(CHALLENGE_LIMITS.votingDays).toContain(initialChallengeValues('').votingDays)
  })

  it('an untouched form fails validation only on what the person must fill in', () => {
    const errors = validateChallengeForm(initialChallengeValues('kay'))
    expect(Object.keys(errors).sort()).toEqual(['title', 'videoUrl'])
  })
})

describe('buildChallengeVariables', () => {
  const values = {
    username: '  kay ',
    title: '  Scratch off ',
    message: '  Bring it.  ',
    videoUrl: ' https://youtu.be/abc ',
    votingDays: 14,
  }

  it('sends exactly the mutation arguments, trimmed', () => {
    expect(buildChallengeVariables(values)).toEqual({
      opponentUsername: 'kay',
      title: 'Scratch off',
      message: 'Bring it.',
      videoUrl: 'https://youtu.be/abc',
      votingDays: 14,
    })
  })

  it('sends null for a blank message', () => {
    expect(buildChallengeVariables({ ...values, message: '  \n ' }).message).toBeNull()
    expect(buildChallengeVariables({ ...values, message: '' }).message).toBeNull()
  })

  it('has no email field of any kind', () => {
    expect(Object.keys(buildChallengeVariables(values)).sort()).toEqual([
      'message',
      'opponentUsername',
      'title',
      'videoUrl',
      'votingDays',
    ])
  })
})

describe('firstErrorField', () => {
  it('returns the first invalid field in form order', () => {
    expect(firstErrorField({ videoUrl: 'x', title: 'y' })).toBe('title')
    expect(firstErrorField({ votingDays: 'z', username: 'a', message: 'b' })).toBe('username')
  })

  it('is null when there are no errors', () => {
    expect(firstErrorField({})).toBeNull()
  })
})

describe('challengeErrorMessage', () => {
  it('shows the server message for a BAD_USER_INPUT error (limits, cooldown, unknown DJ)', () => {
    const msg = 'This DJ declined your last challenge. You can try again on Nov 25.'
    expect(challengeErrorMessage(gqlError('BAD_USER_INPUT', msg))).toBe(msg)
    expect(challengeErrorMessage(gqlError('BAD_USER_INPUT', 'You can send 5 challenges a day. Try again tomorrow.'))).toBe(
      'You can send 5 challenges a day. Try again tomorrow.',
    )
  })

  it('shows the server message for the other deliberate codes', () => {
    for (const code of ['RATE_LIMITED', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND']) {
      expect(challengeErrorMessage(gqlError(code, 'Deliberate message.'))).toBe('Deliberate message.')
    }
  })

  it('hides anything else behind a generic message', () => {
    expect(challengeErrorMessage(gqlError('INTERNAL_SERVER_ERROR', 'prisma.challenge.create() failed'))).toBe(GENERIC)
    expect(challengeErrorMessage(gqlError(undefined, 'something odd'))).toBe(GENERIC)
  })

  it('hides a network failure and non-errors', () => {
    expect(challengeErrorMessage(new TypeError('Failed to fetch'))).toBe(GENERIC)
    expect(challengeErrorMessage('boom')).toBe(GENERIC)
    expect(challengeErrorMessage(null)).toBe(GENERIC)
    expect(challengeErrorMessage({ graphQLErrors: [] })).toBe(GENERIC)
  })

  it('uses the first safe message when several errors came back', () => {
    const err = {
      message: 'outer',
      graphQLErrors: [
        { message: 'internal detail', extensions: { code: 'INTERNAL_SERVER_ERROR' } },
        { message: 'Pick a DJ.', extensions: { code: 'BAD_USER_INPUT' } },
      ],
    }
    expect(challengeErrorMessage(err)).toBe('Pick a DJ.')
  })

  it('ignores a safe code with a blank message', () => {
    expect(challengeErrorMessage(gqlError('BAD_USER_INPUT', '   '))).toBe(GENERIC)
  })
})

describe('serverErrorField', () => {
  it('ties the username refusals to the DJ field', () => {
    expect(serverErrorField('No DJ with that username.')).toBe('username')
    expect(serverErrorField("You can't challenge yourself.")).toBe('username')
    expect(serverErrorField("That DJ can't be challenged right now.")).toBe('username')
  })

  it('leaves limits, cooldown and everything else as a form message', () => {
    expect(serverErrorField('You can send 5 challenges a day. Try again tomorrow.')).toBeNull()
    expect(serverErrorField('This DJ declined your last challenge. You can try again on Nov 25.')).toBeNull()
    expect(serverErrorField('You already have a challenge with this DJ waiting.')).toBeNull()
    expect(serverErrorField(GENERIC)).toBeNull()
  })
})

describe('challengePath', () => {
  it('points at the challenge screen', () => {
    expect(challengePath('abc123')).toBe('/challenges/abc123')
  })

  it('encodes the id so it can never break out of the path', () => {
    expect(challengePath('a/b?c')).toBe('/challenges/a%2Fb%3Fc')
  })
})
