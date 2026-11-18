import { describe, expect, it } from 'vitest'
import { print, validate } from 'graphql'
import {
  CHALLENGES_WAITING_POLL_MS,
  challengeEmailsChecked,
  myChallengeRow,
  myChallengesSections,
  profileUpdateVariables,
  waitingAriaLabel,
  waitingCount,
  waitingCountText,
  waitingQueryOptions,
} from './profile-challenges'
import { ME_QUERY, UPDATE_PROFILE_MUTATION } from './graphql/queries'
import { GET_MY_CHALLENGES } from './graphql/challenges'
import { loadServerSchema } from './test-support/server-sdl'

const NOW = new Date('2026-11-18T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

const me = { id: 'u-me', username: 'kay', name: 'Kay Real', image: null }
const them = { id: 'u-them', username: 'dj_zed', name: 'Zed Real', image: null }

function challenge(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    title: 'Scratch showdown',
    status: 'PENDING',
    viewerRole: 'OPPONENT' as const,
    battleId: null,
    expiresAt: at(6 * DAY),
    createdAt: at(-4 * DAY),
    challenger: them,
    opponent: me,
    ...over,
  }
}

describe('waitingQueryOptions', () => {
  it('skips the query when signed out', () => {
    expect(waitingQueryOptions(false).skip).toBe(true)
  })
  it('runs and polls every 5 minutes when signed in', () => {
    expect(waitingQueryOptions(true)).toEqual({ skip: false, pollInterval: 5 * 60 * 1000 })
    expect(CHALLENGES_WAITING_POLL_MS).toBe(300000)
  })
})

describe('waitingCount', () => {
  it('is the number the server sent', () => {
    expect(waitingCount({ challengesWaiting: 3 }, true)).toBe(3)
  })
  it('is 0 when signed out, even with stale data', () => {
    expect(waitingCount({ challengesWaiting: 3 }, false)).toBe(0)
  })
  it('is 0 while loading or when the value is not a sensible count', () => {
    expect(waitingCount(undefined, true)).toBe(0)
    expect(waitingCount({}, true)).toBe(0)
    expect(waitingCount({ challengesWaiting: null }, true)).toBe(0)
    expect(waitingCount({ challengesWaiting: -2 }, true)).toBe(0)
    expect(waitingCount({ challengesWaiting: Number.NaN }, true)).toBe(0)
  })
})

describe('waitingCountText and waitingAriaLabel', () => {
  it('shows nothing for zero', () => {
    expect(waitingCountText(0)).toBe('')
    expect(waitingAriaLabel(0)).toBe('Profile')
  })
  it('shows the number up to 9 and caps larger ones at "9+"', () => {
    expect(waitingCountText(1)).toBe('1')
    expect(waitingCountText(9)).toBe('9')
    expect(waitingCountText(10)).toBe('9+')
    expect(waitingCountText(250)).toBe('9+')
  })
  it('keeps the true number in the accessible label', () => {
    expect(waitingAriaLabel(1)).toBe('Profile, 1 challenge waiting')
    expect(waitingAriaLabel(2)).toBe('Profile, 2 challenges waiting')
    expect(waitingAriaLabel(12)).toBe('Profile, 12 challenges waiting')
  })
})

describe('myChallengeRow', () => {
  it('names the other DJ for the opponent (the challenger)', () => {
    const row = myChallengeRow(challenge(), NOW)
    expect(row).toMatchObject({
      id: 'c1',
      href: '/challenges/c1',
      otherName: 'dj_zed',
      title: 'Scratch showdown',
      status: 'PENDING',
      statusLabel: 'Waiting for you',
      timeLeft: '6 days left',
      actionLabel: 'Respond',
    })
  })

  it('names the other DJ for the challenger (the opponent) and offers no inline action', () => {
    const row = myChallengeRow(challenge({ viewerRole: 'CHALLENGER', challenger: me, opponent: them }), NOW)
    expect(row.otherName).toBe('dj_zed')
    expect(row.statusLabel).toBe('Waiting')
    expect(row.timeLeft).toBe('6 days left')
    expect(row.actionLabel).toBeNull()
  })

  it('falls back to the name, then "A DJ", when the other DJ has no username', () => {
    expect(myChallengeRow(challenge({ challenger: { ...them, username: null } }), NOW).otherName).toBe('Zed Real')
    expect(myChallengeRow(challenge({ challenger: { ...them, username: null, name: null } }), NOW).otherName).toBe('A DJ')
  })

  it('treats an expired waiting challenge as expired: no Respond, no time left', () => {
    const row = myChallengeRow(challenge({ expiresAt: at(-1000) }), NOW)
    expect(row.status).toBe('EXPIRED')
    expect(row.statusLabel).toBe('Expired')
    expect(row.actionLabel).toBeNull()
    expect(row.timeLeft).toBeNull()
  })

  it('shows no time left for answered challenges', () => {
    for (const status of ['ACCEPTED', 'DECLINED', 'WITHDRAWN']) {
      const row = myChallengeRow(challenge({ status, battleId: status === 'ACCEPTED' ? 'b1' : null }), NOW)
      expect(row.timeLeft).toBeNull()
      expect(row.actionLabel).toBeNull()
      expect(row.statusLabel).toBe(status[0] + status.slice(1).toLowerCase())
    }
  })

  it('carries a badge variant for the status', () => {
    expect(myChallengeRow(challenge(), NOW).badgeVariant).toBe('upcoming')
    expect(myChallengeRow(challenge({ status: 'ACCEPTED', battleId: 'b1' }), NOW).badgeVariant).toBe('active')
    expect(myChallengeRow(challenge({ status: 'DECLINED' }), NOW).badgeVariant).toBe('completed')
  })

  it('exposes no video link or message', () => {
    const full = { ...challenge(), challengerVideoUrl: 'https://secret.example/v', message: 'hi' }
    const row = myChallengeRow(full, NOW)
    expect(JSON.stringify(row)).not.toContain('secret.example')
    expect(Object.keys(row)).not.toContain('challengerVideoUrl')
    expect(Object.keys(row)).not.toContain('message')
  })
})

describe('myChallengesSections', () => {
  it('is empty when there is nothing (the section is hidden)', () => {
    expect(myChallengesSections([], NOW)).toEqual([])
    expect(myChallengesSections(undefined, NOW)).toEqual([])
  })

  it('shows only the groups that have rows, in order: waiting, sent, recent', () => {
    const list = [
      challenge({ id: 'recent', status: 'DECLINED' }),
      challenge({ id: 'sent', viewerRole: 'CHALLENGER', challenger: me, opponent: them }),
      challenge({ id: 'waiting' }),
    ]
    const sections = myChallengesSections(list, NOW)
    expect(sections.map((s) => s.key)).toEqual(['waiting', 'sent', 'recent'])
    expect(sections.map((s) => s.title)).toEqual(['Waiting for you', 'Sent', 'Recent'])
    expect(sections.map((s) => s.rows.map((r) => r.id))).toEqual([['waiting'], ['sent'], ['recent']])

    const onlySent = myChallengesSections([list[1]], NOW)
    expect(onlySent.map((s) => s.key)).toEqual(['sent'])
  })

  it('puts an expired waiting challenge under Recent, with no Respond', () => {
    const sections = myChallengesSections([challenge({ id: 'old', expiresAt: at(-1000) })], NOW)
    expect(sections.map((s) => s.key)).toEqual(['recent'])
    expect(sections[0].rows[0].actionLabel).toBeNull()
    expect(sections[0].rows[0].statusLabel).toBe('Expired')
  })

  it('caps Recent at 5, newest first, as groupMyChallenges does', () => {
    const list = Array.from({ length: 8 }, (_, i) =>
      challenge({ id: `r${i}`, status: 'DECLINED', createdAt: at(-i * DAY) }),
    )
    const recent = myChallengesSections(list, NOW)[0]
    expect(recent.key).toBe('recent')
    expect(recent.rows.map((r) => r.id)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4'])
  })
})

describe('challengeEmailsChecked', () => {
  it('is on by default: null and missing mean on', () => {
    expect(challengeEmailsChecked(null)).toBe(true)
    expect(challengeEmailsChecked(undefined)).toBe(true)
    expect(challengeEmailsChecked(true)).toBe(true)
  })
  it('is off only when the user turned it off', () => {
    expect(challengeEmailsChecked(false)).toBe(false)
  })
})

describe('profileUpdateVariables', () => {
  it('sends the existing fields unchanged plus the checkbox as a real boolean', () => {
    expect(
      profileUpdateVariables({
        username: 'kay',
        image: 'https://img.example/a.png',
        crews: ['The Allies'],
        challengeEmails: false,
      }),
    ).toEqual({
      username: 'kay',
      image: 'https://img.example/a.png',
      externalCrews: ['The Allies'],
      challengeEmails: false,
    })
    expect(profileUpdateVariables({ username: 'kay', image: '', crews: [], challengeEmails: true })).toEqual({
      username: 'kay',
      image: '',
      externalCrews: [],
      challengeEmails: true,
    })
  })
})

describe('profile documents against the server SDL', () => {
  const schema = loadServerSchema()
  it.each([
    ['ME_QUERY', ME_QUERY],
    ['UPDATE_PROFILE_MUTATION', UPDATE_PROFILE_MUTATION],
    ['GET_MY_CHALLENGES', GET_MY_CHALLENGES],
  ] as const)('%s is valid', (_n, doc) => {
    expect(validate(schema, doc).map((e) => e.message)).toEqual([])
  })

  it('ME_QUERY reads the setting and the update sends and returns it', () => {
    expect(print(ME_QUERY)).toContain('challengeEmails')
    const update = print(UPDATE_PROFILE_MUTATION)
    expect(update).toContain('$challengeEmails: Boolean')
    expect(update).toContain('challengeEmails: $challengeEmails')
  })

  it('the list document never asks for a video link, message or email', () => {
    const text = print(GET_MY_CHALLENGES)
    expect(text).not.toContain('challengerVideoUrl')
    expect(text).not.toContain('message')
    expect(text).not.toContain('email')
  })
})
