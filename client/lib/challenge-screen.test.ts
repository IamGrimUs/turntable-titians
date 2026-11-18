import { describe, expect, it } from 'vitest'
import { InMemoryCache } from '@apollo/client'
import {
  acceptVariables,
  battlePath,
  careerWinsText,
  challengeClosedStatement,
  challengeHeadline,
  challengeRuleBullets,
  challengeScreenView,
  challengeUserName,
  clearChallengerVideo,
  isChallengeUnavailable,
  ownEntryLink,
  previewEmbedUrl,
} from './challenge-screen'
import { GET_CHALLENGE } from './graphql/challenges'

const NOW = new Date('2026-11-18T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

const base = { viewerRole: 'OPPONENT' as const, status: 'PENDING', expiresAt: at(5 * DAY), battleId: null }

describe('challengeScreenView', () => {
  it('the opponent of a waiting challenge responds', () => {
    const v = challengeScreenView(base, NOW)
    expect(v).toMatchObject({ kind: 'RESPOND', status: 'PENDING', statusLabel: 'Waiting for you', showTimeLeft: true })
  })

  it('the challenger of a waiting challenge waits and can withdraw', () => {
    const v = challengeScreenView({ ...base, viewerRole: 'CHALLENGER' }, NOW)
    expect(v).toMatchObject({ kind: 'WAITING', status: 'PENDING', statusLabel: 'Waiting', showTimeLeft: true })
  })

  it('an accepted challenge links to the battle for both DJs', () => {
    for (const viewerRole of ['CHALLENGER', 'OPPONENT'] as const) {
      const v = challengeScreenView({ viewerRole, status: 'ACCEPTED', expiresAt: at(-DAY), battleId: 'b1' }, NOW)
      expect(v).toMatchObject({ kind: 'ACCEPTED', statusLabel: 'Accepted', showTimeLeft: false, battleId: 'b1' })
    }
  })

  it('declined and withdrawn challenges are closed, with no actions', () => {
    for (const status of ['DECLINED', 'WITHDRAWN']) {
      for (const viewerRole of ['CHALLENGER', 'OPPONENT'] as const) {
        const v = challengeScreenView({ viewerRole, status, expiresAt: at(5 * DAY), battleId: null }, NOW)
        expect(v.kind).toBe('CLOSED')
        expect(v.showTimeLeft).toBe(false)
      }
    }
  })

  it('a waiting challenge past expiresAt is expired and closed, whatever the stored status says', () => {
    for (const viewerRole of ['CHALLENGER', 'OPPONENT'] as const) {
      const v = challengeScreenView({ ...base, viewerRole, expiresAt: at(-1) }, NOW)
      expect(v).toMatchObject({ kind: 'CLOSED', status: 'EXPIRED', statusLabel: 'Expired', showTimeLeft: false })
    }
  })

  it('a challenge that expires while the page is open loses its actions at the next tick', () => {
    const c = { ...base, expiresAt: at(30_000) }
    expect(challengeScreenView(c, NOW).kind).toBe('RESPOND')
    expect(challengeScreenView(c, new Date(NOW.getTime() + 30_000)).kind).toBe('CLOSED')
  })

  it('an accepted challenge without a battle id is closed, not a dead link', () => {
    const v = challengeScreenView({ viewerRole: 'OPPONENT', status: 'ACCEPTED', expiresAt: at(DAY), battleId: null }, NOW)
    expect(v.kind).toBe('CLOSED')
    expect(v.status).toBe('ACCEPTED')
  })
})

describe('ownEntryLink', () => {
  const url = 'https://youtu.be/abcdefghijk'

  it('is the challenger own link while the challenge is waiting', () => {
    expect(ownEntryLink({ ...base, viewerRole: 'CHALLENGER', challengerVideoUrl: url }, NOW)).toBe(url)
  })

  it('is never given to the opponent, even if the field were present', () => {
    expect(ownEntryLink({ ...base, viewerRole: 'OPPONENT', challengerVideoUrl: url }, NOW)).toBeNull()
  })

  it('is not shown once the challenge is no longer waiting (declined, withdrawn, accepted, expired)', () => {
    for (const status of ['DECLINED', 'WITHDRAWN', 'ACCEPTED']) {
      expect(ownEntryLink({ ...base, viewerRole: 'CHALLENGER', status, challengerVideoUrl: url }, NOW)).toBeNull()
    }
    expect(ownEntryLink({ ...base, viewerRole: 'CHALLENGER', expiresAt: at(-1), challengerVideoUrl: url }, NOW)).toBeNull()
  })

  it('is null when there is no link, and refuses anything that is not an https link', () => {
    const c = { ...base, viewerRole: 'CHALLENGER' as const }
    expect(ownEntryLink({ ...c, challengerVideoUrl: null }, NOW)).toBeNull()
    expect(ownEntryLink({ ...c, challengerVideoUrl: 'javascript:alert(1)' }, NOW)).toBeNull()
    expect(ownEntryLink({ ...c, challengerVideoUrl: 'http://example.com/x' }, NOW)).toBeNull()
    expect(ownEntryLink({ ...c, challengerVideoUrl: 'not a url' }, NOW)).toBeNull()
  })
})

describe('challengeUserName and careerWinsText', () => {
  it('prefers the username, then the name, then a neutral word', () => {
    expect(challengeUserName({ username: 'kay', name: 'Kay Lee' })).toBe('kay')
    expect(challengeUserName({ username: null, name: 'Kay Lee' })).toBe('Kay Lee')
    expect(challengeUserName({ username: '  ', name: null })).toBe('A DJ')
    expect(challengeUserName(null)).toBe('A DJ')
  })

  it('says career wins in the singular and plural', () => {
    expect(careerWinsText(0)).toBe('0 career wins')
    expect(careerWinsText(1)).toBe('1 career win')
    expect(careerWinsText(12)).toBe('12 career wins')
  })

  it('says nothing when the number is missing', () => {
    expect(careerWinsText(null)).toBeNull()
    expect(careerWinsText(undefined)).toBeNull()
  })
})

describe('challengeHeadline', () => {
  it('speaks to the opponent as "you"', () => {
    expect(challengeHeadline('OPPONENT', 'jo', 'kay')).toBe('jo challenged you')
  })

  it('speaks of the challenger as "you"', () => {
    expect(challengeHeadline('CHALLENGER', 'jo', 'kay')).toBe('You challenged kay')
  })
})

describe('challengeRuleBullets', () => {
  it('lists the three rules with the voting length and the challenger name', () => {
    expect(challengeRuleBullets(7, 'jo')).toEqual([
      'Voting runs for 7 days once you accept.',
      'You and jo cannot vote in this battle.',
      'Vote counts stay hidden until the battle ends.',
    ])
  })
})

describe('challengeClosedStatement', () => {
  it('says what happened, from the viewer side', () => {
    expect(challengeClosedStatement('DECLINED', 'OPPONENT', 'jo')).toBe('You declined this challenge.')
    expect(challengeClosedStatement('DECLINED', 'CHALLENGER', 'kay')).toBe('kay declined this challenge.')
    expect(challengeClosedStatement('WITHDRAWN', 'CHALLENGER', 'kay')).toBe('You withdrew this challenge.')
    expect(challengeClosedStatement('WITHDRAWN', 'OPPONENT', 'jo')).toBe('jo withdrew this challenge.')
    expect(challengeClosedStatement('EXPIRED', 'OPPONENT', 'jo')).toBe('This challenge expired before it was answered.')
  })

  it('has a plain fallback for anything else', () => {
    expect(challengeClosedStatement('ACCEPTED', 'OPPONENT', 'jo')).toBe('This challenge was accepted.')
    expect(challengeClosedStatement('SOMETHING_NEW', 'OPPONENT', 'jo')).toBe('This challenge is closed.')
  })
})

describe('acceptVariables', () => {
  it('sends the id and the trimmed link, nothing else', () => {
    expect(acceptVariables('c1', '  https://youtu.be/abcdefghijk \n')).toEqual({
      id: 'c1',
      videoUrl: 'https://youtu.be/abcdefghijk',
    })
  })
})

describe('previewEmbedUrl', () => {
  it('embeds a valid YouTube link for the live preview', () => {
    expect(previewEmbedUrl(' https://www.youtube.com/watch?v=abcdefghijk ')).toBe(
      'https://www.youtube.com/embed/abcdefghijk',
    )
  })

  it('shows no preview for an unfinished, plain http or non-YouTube link', () => {
    expect(previewEmbedUrl('')).toBeNull()
    expect(previewEmbedUrl('https://youtube.com/watch?v=short')).toBeNull()
    expect(previewEmbedUrl('http://www.youtube.com/watch?v=abcdefghijk')).toBeNull()
    expect(previewEmbedUrl('https://example.com/video')).toBeNull()
  })
})

describe('battlePath', () => {
  it('points at the battle page and encodes the id', () => {
    expect(battlePath('b1')).toBe('/battles/b1')
    expect(battlePath('a/b?c')).toBe('/battles/a%2Fb%3Fc')
  })
})

describe('isChallengeUnavailable', () => {
  it('is true for NOT_FOUND (a stranger and a missing challenge look the same)', () => {
    expect(
      isChallengeUnavailable({ graphQLErrors: [{ message: 'Challenge not found', extensions: { code: 'NOT_FOUND' } }] }),
    ).toBe(true)
  })

  it('is false for everything else, so a real failure still offers a retry', () => {
    expect(
      isChallengeUnavailable({ graphQLErrors: [{ message: 'x', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] }),
    ).toBe(false)
    expect(isChallengeUnavailable(new TypeError('Failed to fetch'))).toBe(false)
    expect(isChallengeUnavailable(null)).toBe(false)
    expect(isChallengeUnavailable({ graphQLErrors: [] })).toBe(false)
  })
})

describe('clearChallengerVideo (the cache never keeps the link once the challenge is closed)', () => {
  const user = (id: string) => ({ __typename: 'User', id, username: id, name: null, image: null, battlesWon: 3 })
  const written = {
    challenge: {
      __typename: 'Challenge',
      id: 'c1',
      title: 'Showdown',
      votingDays: 7,
      status: 'PENDING',
      expiresAt: at(5 * DAY),
      createdAt: at(-DAY),
      respondedAt: null,
      viewerRole: 'CHALLENGER',
      battleId: null,
      challenger: user('jo'),
      opponent: user('kay'),
      message: 'Bring it',
      challengerVideoUrl: 'https://youtu.be/abcdefghijk',
    },
  }

  function seeded() {
    const cache = new InMemoryCache()
    cache.writeQuery({ query: GET_CHALLENGE, variables: { id: 'c1' }, data: written })
    return cache
  }

  it('nulls the link when the challenge is no longer waiting', () => {
    for (const status of ['WITHDRAWN', 'DECLINED', 'ACCEPTED']) {
      const cache = seeded()
      clearChallengerVideo(cache, { id: 'c1', status })
      expect(cache.extract()['Challenge:c1']).toMatchObject({ challengerVideoUrl: null })
    }
  })

  it('leaves a waiting challenge alone', () => {
    const cache = seeded()
    clearChallengerVideo(cache, { id: 'c1', status: 'PENDING' })
    expect(cache.extract()['Challenge:c1']).toMatchObject({ challengerVideoUrl: 'https://youtu.be/abcdefghijk' })
  })

  it('does nothing for a challenge that is not cached, or a missing result', () => {
    const cache = new InMemoryCache()
    expect(() => clearChallengerVideo(cache, { id: 'nope', status: 'DECLINED' })).not.toThrow()
    expect(() => clearChallengerVideo(cache, null)).not.toThrow()
    expect(cache.extract()).toEqual({})
  })
})
