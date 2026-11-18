import { describe, it, expect } from 'vitest'
import { GraphQLError } from 'graphql'
import {
  CHALLENGE_LIMITS,
  effectiveStatus,
  expiryFrom,
  cleanChallengeInput,
  createBlockReason,
  battleDatesForAccept,
  duelOutcome,
  viewerRole,
} from './challengeRules'

const DAY = 24 * 60 * 60 * 1000

function thrown(fn: () => unknown): GraphQLError {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(GraphQLError)
    return e as GraphQLError
  }
  throw new Error('expected function to throw')
}

function expectBadInput(fn: () => unknown, message?: string) {
  const e = thrown(fn)
  expect(e.extensions.code).toBe('BAD_USER_INPUT')
  if (message !== undefined) expect(e.message).toBe(message)
}

describe('CHALLENGE_LIMITS', () => {
  it('holds the agreed limits', () => {
    expect(CHALLENGE_LIMITS).toEqual({
      titleMax: 100,
      messageMax: 280,
      answerDays: 10,
      votingDays: [3, 7, 14],
      pendingOutgoing: 3,
      perDay: 5,
      declineCooldownDays: 7,
    })
  })
})

describe('effectiveStatus', () => {
  const now = new Date(2026, 10, 18, 12, 0, 0)

  it('keeps PENDING while expiresAt is in the future', () => {
    expect(effectiveStatus({ status: 'PENDING', expiresAt: new Date(now.getTime() + 1000) }, now)).toBe('PENDING')
  })

  it('turns PENDING into EXPIRED one second after expiresAt', () => {
    expect(effectiveStatus({ status: 'PENDING', expiresAt: new Date(now.getTime() - 1000) }, now)).toBe('EXPIRED')
  })

  it('turns PENDING into EXPIRED exactly at expiresAt', () => {
    expect(effectiveStatus({ status: 'PENDING', expiresAt: new Date(now.getTime()) }, now)).toBe('EXPIRED')
  })

  it('never expires ACCEPTED, DECLINED or WITHDRAWN', () => {
    const past = new Date(now.getTime() - DAY)
    expect(effectiveStatus({ status: 'ACCEPTED', expiresAt: past }, now)).toBe('ACCEPTED')
    expect(effectiveStatus({ status: 'DECLINED', expiresAt: past }, now)).toBe('DECLINED')
    expect(effectiveStatus({ status: 'WITHDRAWN', expiresAt: past }, now)).toBe('WITHDRAWN')
  })
})

describe('expiryFrom', () => {
  it('is exactly 10 days ahead', () => {
    const now = new Date(2026, 10, 18, 12, 0, 0)
    expect(expiryFrom(now).getTime()).toBe(now.getTime() + 10 * DAY)
  })
})

describe('cleanChallengeInput', () => {
  const valid = {
    opponentUsername: 'dj_rival',
    title: 'Settle it',
    message: 'Bring your best.',
    videoUrl: 'https://example.com/video',
    votingDays: 7,
  }

  it('returns cleaned values', () => {
    expect(cleanChallengeInput(valid)).toEqual({
      opponentUsername: 'dj_rival',
      title: 'Settle it',
      message: 'Bring your best.',
      videoUrl: 'https://example.com/video',
      votingDays: 7,
    })
  })

  it('trims text fields', () => {
    const out = cleanChallengeInput({
      ...valid,
      opponentUsername: '  dj_rival ',
      title: '  Settle it  ',
      message: '  hi  ',
      videoUrl: '  https://example.com/video  ',
    })
    expect(out.opponentUsername).toBe('dj_rival')
    expect(out.title).toBe('Settle it')
    expect(out.message).toBe('hi')
    expect(out.videoUrl).toBe('https://example.com/video')
  })

  it('requires a non-empty string username', () => {
    expectBadInput(() => cleanChallengeInput({ ...valid, opponentUsername: '' }))
    expectBadInput(() => cleanChallengeInput({ ...valid, opponentUsername: '   ' }))
    expectBadInput(() => cleanChallengeInput({ ...valid, opponentUsername: null }))
    expectBadInput(() => cleanChallengeInput({ ...valid, opponentUsername: 42 }))
  })

  it('requires a title', () => {
    expectBadInput(() => cleanChallengeInput({ ...valid, title: '' }))
    expectBadInput(() => cleanChallengeInput({ ...valid, title: '   ' }))
    expectBadInput(() => cleanChallengeInput({ ...valid, title: undefined }))
  })

  it('rejects a title over 100 characters but accepts exactly 100', () => {
    expect(cleanChallengeInput({ ...valid, title: 'a'.repeat(100) }).title).toHaveLength(100)
    expectBadInput(() => cleanChallengeInput({ ...valid, title: 'a'.repeat(101) }))
  })

  it('rejects links in the title', () => {
    expectBadInput(() => cleanChallengeInput({ ...valid, title: 'Watch https://x.com' }))
    expectBadInput(() => cleanChallengeInput({ ...valid, title: 'Watch www.x.com' }))
  })

  it('treats a missing or empty message as null', () => {
    expect(cleanChallengeInput({ ...valid, message: undefined }).message).toBeNull()
    expect(cleanChallengeInput({ ...valid, message: null }).message).toBeNull()
    expect(cleanChallengeInput({ ...valid, message: '' }).message).toBeNull()
    expect(cleanChallengeInput({ ...valid, message: '   ' }).message).toBeNull()
    const { message: _omit, ...withoutMessage } = valid
    expect(cleanChallengeInput(withoutMessage).message).toBeNull()
  })

  it('rejects a message over 280 characters but accepts exactly 280', () => {
    expect(cleanChallengeInput({ ...valid, message: 'a'.repeat(280) }).message).toHaveLength(280)
    expectBadInput(() => cleanChallengeInput({ ...valid, message: 'a'.repeat(281) }))
  })

  it('rejects links in the message', () => {
    expectBadInput(() => cleanChallengeInput({ ...valid, message: 'see https://x.com' }))
    expectBadInput(() => cleanChallengeInput({ ...valid, message: 'see www.x.com' }))
  })

  it('requires an https video link', () => {
    expectBadInput(() => cleanChallengeInput({ ...valid, videoUrl: 'http://example.com/v' }))
    expectBadInput(() => cleanChallengeInput({ ...valid, videoUrl: 'javascript:alert(1)' }))
    expectBadInput(() => cleanChallengeInput({ ...valid, videoUrl: '' }))
    expectBadInput(() => cleanChallengeInput({ ...valid, videoUrl: undefined }))
  })

  it('accepts only 3, 7 or 14 voting days', () => {
    for (const days of [3, 7, 14]) {
      expect(cleanChallengeInput({ ...valid, votingDays: days }).votingDays).toBe(days)
    }
    for (const bad of [5, 7.5, '7', null, undefined, 0, -3]) {
      expectBadInput(() => cleanChallengeInput({ ...valid, votingDays: bad }), 'Choose 3, 7 or 14 days.')
    }
  })
})

describe('createBlockReason', () => {
  const now = new Date(2026, 10, 18, 10, 0, 0)
  const open = { pendingOutgoing: 0, createdLast24h: 0, pairPending: false, lastDeclinedAt: null, now }

  it('returns null when nothing blocks', () => {
    expect(createBlockReason(open)).toBeNull()
  })

  it('returns null with 2 pending and 4 sent today', () => {
    expect(createBlockReason({ ...open, pendingOutgoing: 2, createdLast24h: 4 })).toBeNull()
  })

  it('blocks when a challenge with this DJ is already waiting', () => {
    expect(createBlockReason({ ...open, pairPending: true })).toBe('You already have a challenge with this DJ waiting.')
  })

  it('blocks for a decline 6 days ago and says when to try again', () => {
    const lastDeclinedAt = new Date(now.getTime() - 6 * DAY)
    // declined 6 days before Nov 18, so the cooldown ends 1 day later: Nov 19
    expect(createBlockReason({ ...open, lastDeclinedAt })).toBe(
      'This DJ declined your last challenge. You can try again on Nov 19.'
    )
  })

  it('does not block for a decline 7 days ago', () => {
    const lastDeclinedAt = new Date(now.getTime() - 7 * DAY)
    expect(createBlockReason({ ...open, lastDeclinedAt })).toBeNull()
  })

  it('blocks at 3 pending outgoing challenges', () => {
    expect(createBlockReason({ ...open, pendingOutgoing: 3 })).toBe(
      'You have 3 challenges waiting for an answer. Wait for a reply or withdraw one.'
    )
  })

  it('blocks at 5 challenges in 24 hours', () => {
    expect(createBlockReason({ ...open, createdLast24h: 5 })).toBe(
      'You can send 5 challenges a day. Try again tomorrow.'
    )
  })

  it('checks pair, then cooldown, then pending, then daily', () => {
    const lastDeclinedAt = new Date(now.getTime() - 1 * DAY)
    const all = { pendingOutgoing: 3, createdLast24h: 5, pairPending: true, lastDeclinedAt, now }
    expect(createBlockReason(all)).toBe('You already have a challenge with this DJ waiting.')
    expect(createBlockReason({ ...all, pairPending: false })).toMatch(/^This DJ declined your last challenge/)
    expect(createBlockReason({ ...all, pairPending: false, lastDeclinedAt: null })).toMatch(
      /^You have 3 challenges waiting/
    )
    expect(createBlockReason({ ...all, pairPending: false, lastDeclinedAt: null, pendingOutgoing: 0 })).toMatch(
      /^You can send 5 challenges a day/
    )
  })
})

describe('battleDatesForAccept', () => {
  it('starts at local midnight today and ends votingDays calendar days later', () => {
    const { start, end } = battleDatesForAccept(new Date(2026, 10, 18, 23, 30), 7)
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 10, 18])
    expect([start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()]).toEqual([0, 0, 0, 0])
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 10, 25])
    expect([end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()]).toEqual([0, 0, 0, 0])
  })

  it('rolls over a month boundary', () => {
    const { end } = battleDatesForAccept(new Date(2026, 10, 28, 8, 0), 14)
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 11, 12])
  })

  it('counts calendar days across a daylight-saving change (not 24-hour blocks)', () => {
    // Under TZ=America/Los_Angeles the clocks go forward on Mar 8 2026, so start + 7 * 86400000
    // would land at 1 a.m. on Mar 12 and this would fail. The local date and hour must hold.
    const { end } = battleDatesForAccept(new Date(2026, 2, 5, 23, 59), 7)
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 2, 12])
    expect(end.getHours()).toBe(0)
  })
})

describe('duelOutcome', () => {
  it('names the winner by votes', () => {
    expect(duelOutcome(5, 3)).toBe('CHALLENGER_WON')
    expect(duelOutcome(3, 5)).toBe('OPPONENT_WON')
  })

  it('calls a tie, including 0-0, a draw', () => {
    expect(duelOutcome(4, 4)).toBe('DRAW')
    expect(duelOutcome(0, 0)).toBe('DRAW')
  })
})

describe('viewerRole', () => {
  const c = { challengerId: 'a', opponentId: 'b' }

  it('identifies the two DJs', () => {
    expect(viewerRole(c, 'a')).toBe('CHALLENGER')
    expect(viewerRole(c, 'b')).toBe('OPPONENT')
  })

  it('returns null for a third user and for nobody', () => {
    expect(viewerRole(c, 'c')).toBeNull()
    expect(viewerRole(c, null)).toBeNull()
  })
})
