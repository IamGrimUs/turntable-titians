import { describe, expect, it } from 'vitest'
import {
  CHALLENGE_LIMITS,
  challengeActions,
  challengeBadgeVariant,
  challengeStatusFor,
  challengeStatusLabel,
  duelResultLine,
  effectiveChallengeStatus,
  groupMyChallenges,
  headToHeadText,
  timeLeftLabel,
  validateChallengeForm,
  type ChallengeRow,
} from './challenge-view'

const NOW = new Date('2026-11-18T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

describe('CHALLENGE_LIMITS (mirrors server/src/challengeRules.ts)', () => {
  it('has the agreed values', () => {
    expect(CHALLENGE_LIMITS.titleMax).toBe(100)
    expect(CHALLENGE_LIMITS.messageMax).toBe(280)
    expect(CHALLENGE_LIMITS.usernameMax).toBe(30)
    expect(CHALLENGE_LIMITS.urlMax).toBe(500)
    expect([...CHALLENGE_LIMITS.votingDays]).toEqual([3, 7, 14])
    expect(CHALLENGE_LIMITS.answerDays).toBe(10)
  })
})

describe('challengeStatusLabel', () => {
  it('names every status', () => {
    expect(challengeStatusLabel('PENDING')).toBe('Waiting')
    expect(challengeStatusLabel('ACCEPTED')).toBe('Accepted')
    expect(challengeStatusLabel('DECLINED')).toBe('Declined')
    expect(challengeStatusLabel('WITHDRAWN')).toBe('Withdrawn')
    expect(challengeStatusLabel('EXPIRED')).toBe('Expired')
  })

  it('returns an unknown value as sent', () => {
    expect(challengeStatusLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW')
  })
})

describe('challengeStatusFor', () => {
  it('says "Waiting for you" only to the opponent of a pending challenge', () => {
    expect(challengeStatusFor('OPPONENT', 'PENDING')).toBe('Waiting for you')
    expect(challengeStatusFor('CHALLENGER', 'PENDING')).toBe('Waiting')
  })

  it('uses the plain label for every other status, for either role', () => {
    for (const role of ['CHALLENGER', 'OPPONENT'] as const) {
      expect(challengeStatusFor(role, 'ACCEPTED')).toBe('Accepted')
      expect(challengeStatusFor(role, 'DECLINED')).toBe('Declined')
      expect(challengeStatusFor(role, 'WITHDRAWN')).toBe('Withdrawn')
      expect(challengeStatusFor(role, 'EXPIRED')).toBe('Expired')
    }
  })
})

describe('challengeBadgeVariant', () => {
  it('maps statuses onto the existing Badge variants', () => {
    expect(challengeBadgeVariant('PENDING')).toBe('upcoming')
    expect(challengeBadgeVariant('ACCEPTED')).toBe('active')
    expect(challengeBadgeVariant('DECLINED')).toBe('completed')
    expect(challengeBadgeVariant('WITHDRAWN')).toBe('completed')
    expect(challengeBadgeVariant('EXPIRED')).toBe('completed')
  })

  it('falls back to outline for an unknown status', () => {
    expect(challengeBadgeVariant('SOMETHING_NEW')).toBe('outline')
  })
})

describe('timeLeftLabel', () => {
  it('counts whole days left', () => {
    expect(timeLeftLabel(at(8 * DAY), NOW)).toBe('8 days left')
    expect(timeLeftLabel(at(10 * DAY), NOW)).toBe('10 days left')
    expect(timeLeftLabel(at(2 * DAY), NOW)).toBe('2 days left')
  })

  it('never rounds up: 8 days and 23 hours is still 8 days', () => {
    expect(timeLeftLabel(at(8 * DAY + 23 * 60 * 60 * 1000), NOW)).toBe('8 days left')
  })

  it('says "1 day left" from exactly one day up to just under two', () => {
    expect(timeLeftLabel(at(DAY), NOW)).toBe('1 day left')
    expect(timeLeftLabel(at(2 * DAY - 61_000), NOW)).toBe('1 day left')
  })

  it('gives a one-minute grace so a challenge sent a moment ago reads the full 10 days', () => {
    // The form promises 10 days; the page opens a few seconds after the server stamped `expiresAt`.
    expect(timeLeftLabel(at(10 * DAY - 5_000), NOW)).toBe('10 days left')
    expect(timeLeftLabel(at(10 * DAY - 60_000), NOW)).toBe('10 days left')
    expect(timeLeftLabel(at(10 * DAY - 60_001), NOW)).toBe('9 days left')
    expect(timeLeftLabel(at(2 * DAY - 60_000), NOW)).toBe('2 days left')
  })

  it('does not stretch the last day: under a day is still "Expires today"', () => {
    expect(timeLeftLabel(at(DAY - 1), NOW)).toBe('Expires today')
  })

  it('says "Expires today" for the last day', () => {
    expect(timeLeftLabel(at(DAY - 1), NOW)).toBe('Expires today')
    expect(timeLeftLabel(at(1), NOW)).toBe('Expires today')
  })

  it('says "Expired" at the exact instant and after (the server uses expiresAt <= now)', () => {
    expect(timeLeftLabel(at(0), NOW)).toBe('Expired')
    expect(timeLeftLabel(at(-1), NOW)).toBe('Expired')
    expect(timeLeftLabel(at(-5 * DAY), NOW)).toBe('Expired')
  })

  it('returns an empty string for a date it cannot read', () => {
    expect(timeLeftLabel('not a date', NOW)).toBe('')
  })
})

describe('challengeActions', () => {
  it('lets the opponent respond to a waiting challenge', () => {
    expect(challengeActions({ viewerRole: 'OPPONENT', status: 'PENDING', battleId: null })).toEqual(['RESPOND'])
  })

  it('lets the challenger withdraw a waiting challenge', () => {
    expect(challengeActions({ viewerRole: 'CHALLENGER', status: 'PENDING', battleId: null })).toEqual(['WITHDRAW'])
  })

  it('opens the battle of an accepted challenge for both DJs', () => {
    for (const viewerRole of ['CHALLENGER', 'OPPONENT'] as const) {
      expect(challengeActions({ viewerRole, status: 'ACCEPTED', battleId: 'b1' })).toEqual(['OPEN_BATTLE'])
    }
  })

  it('offers nothing for an accepted challenge without a battle id', () => {
    expect(challengeActions({ viewerRole: 'OPPONENT', status: 'ACCEPTED', battleId: null })).toEqual([])
  })

  it('offers nothing once a challenge is expired, declined or withdrawn', () => {
    for (const viewerRole of ['CHALLENGER', 'OPPONENT'] as const) {
      for (const status of ['EXPIRED', 'DECLINED', 'WITHDRAWN']) {
        expect(challengeActions({ viewerRole, status, battleId: null })).toEqual([])
      }
    }
  })
})

const user = (id: string) => ({ id, username: id, name: null, image: null })
function row(over: Partial<ChallengeRow> & { id: string }): ChallengeRow {
  return {
    title: 't',
    status: 'PENDING',
    viewerRole: 'CHALLENGER',
    battleId: null,
    expiresAt: at(5 * DAY),
    createdAt: at(-DAY),
    challenger: user('a'),
    opponent: user('b'),
    ...over,
  }
}

describe('effectiveChallengeStatus', () => {
  it('turns a waiting challenge past its expiry into EXPIRED, like the server', () => {
    expect(effectiveChallengeStatus(row({ id: '1', expiresAt: at(-1) }), NOW)).toBe('EXPIRED')
    expect(effectiveChallengeStatus(row({ id: '1', expiresAt: at(0) }), NOW)).toBe('EXPIRED')
    expect(effectiveChallengeStatus(row({ id: '1', expiresAt: at(1) }), NOW)).toBe('PENDING')
  })

  it('leaves every other status alone', () => {
    expect(effectiveChallengeStatus(row({ id: '1', status: 'ACCEPTED', expiresAt: at(-DAY) }), NOW)).toBe('ACCEPTED')
  })
})

describe('groupMyChallenges', () => {
  it('splits into waiting for me, sent and recent', () => {
    const list = [
      row({ id: 'in', viewerRole: 'OPPONENT' }),
      row({ id: 'out', viewerRole: 'CHALLENGER' }),
      row({ id: 'acc', status: 'ACCEPTED', battleId: 'b' }),
      row({ id: 'dec', status: 'DECLINED' }),
      row({ id: 'wd', status: 'WITHDRAWN' }),
    ]
    const g = groupMyChallenges(list, NOW)
    expect(g.waitingForMe.map((c) => c.id)).toEqual(['in'])
    expect(g.sent.map((c) => c.id)).toEqual(['out'])
    expect(g.recent.map((c) => c.id).sort()).toEqual(['acc', 'dec', 'wd'])
  })

  it('treats a waiting challenge past its expiry as recent, not waiting', () => {
    const g = groupMyChallenges(
      [
        row({ id: 'late-in', viewerRole: 'OPPONENT', expiresAt: at(-1) }),
        row({ id: 'late-out', viewerRole: 'CHALLENGER', expiresAt: at(-1) }),
      ],
      NOW,
    )
    expect(g.waitingForMe).toEqual([])
    expect(g.sent).toEqual([])
    expect(g.recent.map((c) => c.id).sort()).toEqual(['late-in', 'late-out'])
  })

  it('keeps recent newest first and at most 5', () => {
    const list = Array.from({ length: 8 }, (_, i) =>
      row({ id: `r${i}`, status: 'DECLINED', createdAt: at(-(8 - i) * DAY) }),
    )
    const g = groupMyChallenges(list, NOW)
    expect(g.recent.map((c) => c.id)).toEqual(['r7', 'r6', 'r5', 'r4', 'r3'])
  })

  it('keeps the incoming order inside waiting and sent (the server sends newest first)', () => {
    const list = [
      row({ id: 'o2', viewerRole: 'OPPONENT' }),
      row({ id: 'o1', viewerRole: 'OPPONENT' }),
      row({ id: 's2' }),
      row({ id: 's1' }),
    ]
    const g = groupMyChallenges(list, NOW)
    expect(g.waitingForMe.map((c) => c.id)).toEqual(['o2', 'o1'])
    expect(g.sent.map((c) => c.id)).toEqual(['s2', 's1'])
  })

  it('does not change the list it was given', () => {
    const list = [row({ id: 'a', status: 'DECLINED' }), row({ id: 'b', status: 'DECLINED', createdAt: at(0) })]
    const copy = [...list]
    groupMyChallenges(list, NOW)
    expect(list).toEqual(copy)
  })

  it('handles an empty list', () => {
    expect(groupMyChallenges([], NOW)).toEqual({ waitingForMe: [], sent: [], recent: [] })
  })
})

const valid = {
  username: 'kay',
  title: 'Scratch showdown',
  message: '',
  videoUrl: 'https://youtu.be/abc123',
  votingDays: 7,
}

describe('validateChallengeForm', () => {
  it('returns no errors for a valid form (message is optional)', () => {
    expect(validateChallengeForm(valid)).toEqual({})
    expect(validateChallengeForm({ ...valid, message: 'Loser buys the next round.' })).toEqual({})
  })

  it('requires a username', () => {
    expect(validateChallengeForm({ ...valid, username: '' }).username).toBeTruthy()
    expect(validateChallengeForm({ ...valid, username: '   ' }).username).toBeTruthy()
  })

  it('limits the username to 30 characters', () => {
    expect(validateChallengeForm({ ...valid, username: 'a'.repeat(30) })).toEqual({})
    expect(validateChallengeForm({ ...valid, username: 'a'.repeat(31) }).username).toBeTruthy()
  })

  it('requires a title and caps it at 100 characters', () => {
    expect(validateChallengeForm({ ...valid, title: '  ' }).title).toBeTruthy()
    expect(validateChallengeForm({ ...valid, title: 'a'.repeat(100) })).toEqual({})
    expect(validateChallengeForm({ ...valid, title: 'a'.repeat(101) }).title).toMatch(/100/)
  })

  it('refuses a link in the title, with or without a scheme', () => {
    expect(validateChallengeForm({ ...valid, title: 'see https://x.com' }).title).toMatch(/links/i)
    expect(validateChallengeForm({ ...valid, title: 'go to www.x.com' }).title).toMatch(/links/i)
  })

  it('does not call a stretched word a link (same rule as the server)', () => {
    expect(validateChallengeForm({ ...valid, title: 'Awww. nice' })).toEqual({})
  })

  it('caps the message at 280 characters', () => {
    expect(validateChallengeForm({ ...valid, message: 'a'.repeat(280) })).toEqual({})
    expect(validateChallengeForm({ ...valid, message: 'a'.repeat(281) }).message).toMatch(/280/)
  })

  it('counts a Windows line break as one character, like the server', () => {
    expect(validateChallengeForm({ ...valid, message: 'a\r\n'.repeat(140).trim() })).toEqual({})
  })

  it('refuses a link in the message', () => {
    expect(validateChallengeForm({ ...valid, message: 'watch http://x.com' }).message).toMatch(/links/i)
  })

  it('requires an https video link', () => {
    expect(validateChallengeForm({ ...valid, videoUrl: '' }).videoUrl).toBeTruthy()
    expect(validateChallengeForm({ ...valid, videoUrl: 'http://youtu.be/abc' }).videoUrl).toMatch(/https/)
    expect(validateChallengeForm({ ...valid, videoUrl: 'javascript:alert(1)' }).videoUrl).toBeTruthy()
    expect(validateChallengeForm({ ...valid, videoUrl: 'not a url' }).videoUrl).toBeTruthy()
  })

  it('refuses a video link with credentials, no dot in the host, or over 500 characters', () => {
    expect(validateChallengeForm({ ...valid, videoUrl: 'https://u:p@youtu.be/abc' }).videoUrl).toBeTruthy()
    expect(validateChallengeForm({ ...valid, videoUrl: 'https://localhost/abc' }).videoUrl).toBeTruthy()
    expect(validateChallengeForm({ ...valid, videoUrl: `https://youtu.be/${'a'.repeat(500)}` }).videoUrl).toBeTruthy()
  })

  it('accepts only 3, 7 or 14 voting days', () => {
    for (const votingDays of [3, 7, 14]) expect(validateChallengeForm({ ...valid, votingDays })).toEqual({})
    for (const votingDays of [0, 1, 5, 10, 15, NaN]) {
      expect(validateChallengeForm({ ...valid, votingDays }).votingDays).toBeTruthy()
    }
  })

  it('reports every broken field at once, keyed by field', () => {
    const errors = validateChallengeForm({ username: '', title: '', message: '', videoUrl: '', votingDays: 5 })
    expect(Object.keys(errors).sort()).toEqual(['title', 'username', 'videoUrl', 'votingDays'])
  })
})

describe('duelResultLine', () => {
  const names = { challenger: 'Jo', opponent: 'Kay' }

  it('is null until the duel is completed', () => {
    expect(duelResultLine({ outcome: null, challengerVotes: null, opponentVotes: null }, names)).toBeNull()
  })

  it('names the winner and puts their votes first', () => {
    expect(duelResultLine({ outcome: 'OPPONENT_WON', challengerVotes: 48, opponentVotes: 62 }, names)).toBe(
      'Kay won, 62 to 48',
    )
    expect(duelResultLine({ outcome: 'CHALLENGER_WON', challengerVotes: 7, opponentVotes: 3 }, names)).toBe(
      'Jo won, 7 to 3',
    )
  })

  it('says draw for a tie, including 0 to 0', () => {
    expect(duelResultLine({ outcome: 'DRAW', challengerVotes: 40, opponentVotes: 40 }, names)).toBe('Draw, 40 to 40')
    expect(duelResultLine({ outcome: 'DRAW', challengerVotes: 0, opponentVotes: 0 }, names)).toBe('Draw, 0 to 0')
  })

  it('shows what the server decided and does not recompute the outcome from the votes', () => {
    expect(duelResultLine({ outcome: 'CHALLENGER_WON', challengerVotes: 1, opponentVotes: 9 }, names)).toBe(
      'Jo won, 1 to 9',
    )
  })

  it('still names the winner when the counts are missing', () => {
    expect(duelResultLine({ outcome: 'OPPONENT_WON', challengerVotes: null, opponentVotes: null }, names)).toBe('Kay won')
    expect(duelResultLine({ outcome: 'DRAW', challengerVotes: null, opponentVotes: null }, names)).toBe('Draw')
  })
})

describe('headToHeadText', () => {
  it('writes wins - losses - draws', () => {
    expect(headToHeadText({ wins: 3, losses: 1, draws: 1 })).toBe('3 - 1 - 1')
    expect(headToHeadText({ wins: 0, losses: 0, draws: 0 })).toBe('0 - 0 - 0')
  })
})
