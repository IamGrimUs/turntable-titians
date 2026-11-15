import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    vote: { findFirst: vi.fn() },
    battle: { findUnique: vi.fn(), create: vi.fn() },
    submission: { findFirst: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}))

import { db } from './db'
import { resolvers } from './resolvers'

const m = {
  voteFindFirst: db.vote.findFirst as unknown as ReturnType<typeof vi.fn>,
  battleFindUnique: db.battle.findUnique as unknown as ReturnType<typeof vi.fn>,
  battleCreate: db.battle.create as unknown as ReturnType<typeof vi.fn>,
  submissionFindFirst: db.submission.findFirst as unknown as ReturnType<typeof vi.fn>,
  submissionCreate: db.submission.create as unknown as ReturnType<typeof vi.fn>,
  userFindUnique: db.user.findUnique as unknown as ReturnType<typeof vi.fn>,
  userFindFirst: db.user.findFirst as unknown as ReturnType<typeof vi.fn>,
  userUpdate: db.user.update as unknown as ReturnType<typeof vi.fn>,
}

beforeEach(() => Object.values(m).forEach((fn) => fn.mockReset()))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any
const mutation = (name: string) => (resolvers.Mutation as unknown as Record<string, AnyFn>)[name]
const asUser = { userId: 'user-1' }
const anonymous = { userId: null }

/** Resolves to the thrown GraphQLError so tests can check message and code. */
async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (e) {
    return e as { message: string; extensions: { code: string } }
  }
  throw new Error('expected the resolver to throw')
}

const day = 24 * 3600 * 1000
const battleDates = {
  active: { startDate: new Date(Date.now() - 2 * day), endDate: new Date(Date.now() + 2 * day) },
  ended: { startDate: new Date(Date.now() - 20 * day), endDate: new Date(Date.now() - 10 * day) },
  upcoming: { startDate: new Date(Date.now() + 5 * day), endDate: new Date(Date.now() + 15 * day) },
}

describe('Submission.viewerHasVoted', () => {
  const parent = { id: 'sub-1' } as never
  const viewerHasVoted = resolvers.Submission.viewerHasVoted

  it('is false for anonymous callers and does not touch the database', async () => {
    expect(await viewerHasVoted(parent, {}, anonymous)).toBe(false)
    expect(m.voteFindFirst).not.toHaveBeenCalled()
  })

  it('is true when the caller has a vote on this submission', async () => {
    m.voteFindFirst.mockResolvedValue({ id: 'vote-1' })
    expect(await viewerHasVoted(parent, {}, asUser)).toBe(true)
    expect(m.voteFindFirst).toHaveBeenCalledWith({
      where: { submissionId: 'sub-1', userId: 'user-1' },
      select: { id: true },
    })
  })

  it('is false when the caller has not voted on this submission', async () => {
    m.voteFindFirst.mockResolvedValue(null)
    expect(await viewerHasVoted(parent, {}, asUser)).toBe(false)
  })

  it('only ever looks up the caller\'s own vote, never another user\'s', async () => {
    m.voteFindFirst.mockResolvedValue(null)
    await viewerHasVoted(parent, {}, asUser)
    expect(m.voteFindFirst.mock.calls[0][0].where.userId).toBe('user-1')
  })
})

describe('Submission resolvers', () => {
  it('no longer has a votes resolver', () => {
    expect('votes' in resolvers.Submission).toBe(false)
  })
})

describe('createSubmission', () => {
  const args = { battleId: 'battle-1', videoUrl: 'https://youtube.com/watch?v=abc', title: '  My Set  ', description: 'fire' }

  it('requires login', async () => {
    const e = await rejection(mutation('createSubmission')({}, args, anonymous))
    expect(e.extensions.code).toBe('UNAUTHENTICATED')
    expect(m.battleFindUnique).not.toHaveBeenCalled()
  })

  it('rejects a non-https or script link before touching the database', async () => {
    for (const videoUrl of ['javascript:alert(1)', 'http://youtube.com/x', 'data:text/html,hi', 'nope']) {
      const e = await rejection(mutation('createSubmission')({}, { ...args, videoUrl }, asUser))
      expect(e.extensions.code).toBe('BAD_USER_INPUT')
    }
    expect(m.battleFindUnique).not.toHaveBeenCalled()
    expect(m.submissionCreate).not.toHaveBeenCalled()
  })

  it('rejects an over-long title or description', async () => {
    expect((await rejection(mutation('createSubmission')({}, { ...args, title: 'x'.repeat(101) }, asUser))).message).toMatch(/100/)
    expect((await rejection(mutation('createSubmission')({}, { ...args, description: 'x'.repeat(1001) }, asUser))).message).toMatch(/1000/)
  })

  it('returns NOT_FOUND when the battle does not exist', async () => {
    m.battleFindUnique.mockResolvedValue(null)
    const e = await rejection(mutation('createSubmission')({}, args, asUser))
    expect(e.extensions.code).toBe('NOT_FOUND')
    expect(m.submissionCreate).not.toHaveBeenCalled()
  })

  it('blocks entries to a battle that has ended', async () => {
    m.battleFindUnique.mockResolvedValue(battleDates.ended)
    const e = await rejection(mutation('createSubmission')({}, args, asUser))
    expect(e.message).toMatch(/ended/i)
    expect(e.extensions.code).toBe('BAD_USER_INPUT')
    expect(m.submissionCreate).not.toHaveBeenCalled()
  })

  it('blocks entries to a battle that has not started', async () => {
    m.battleFindUnique.mockResolvedValue(battleDates.upcoming)
    const e = await rejection(mutation('createSubmission')({}, args, asUser))
    expect(e.message).toMatch(/not started/i)
    expect(m.submissionCreate).not.toHaveBeenCalled()
  })

  it('blocks a second entry from the same user in the same battle', async () => {
    m.battleFindUnique.mockResolvedValue(battleDates.active)
    m.submissionFindFirst.mockResolvedValue({ id: 'existing' })
    const e = await rejection(mutation('createSubmission')({}, args, asUser))
    expect(e.message).toMatch(/already/i)
    expect(m.submissionFindFirst).toHaveBeenCalledWith({
      where: { battleId: 'battle-1', userId: 'user-1' },
      select: { id: true },
    })
    expect(m.submissionCreate).not.toHaveBeenCalled()
  })

  it('creates the entry with cleaned values and the caller\'s own id', async () => {
    m.battleFindUnique.mockResolvedValue(battleDates.active)
    m.submissionFindFirst.mockResolvedValue(null)
    m.submissionCreate.mockResolvedValue({ id: 'new' })
    await mutation('createSubmission')({}, args, asUser)
    expect(m.submissionCreate).toHaveBeenCalledWith({
      data: {
        battleId: 'battle-1',
        userId: 'user-1',
        videoUrl: 'https://youtube.com/watch?v=abc',
        title: 'My Set',
        description: 'fire',
      },
    })
  })
})

describe('createBattle', () => {
  const args = {
    title: '  Summer Showdown ',
    type: 'Scratch',
    description: 'ten days of scratching',
    startDate: '2026-11-14T00:00:00.000Z',
    endDate: '2026-11-24T00:00:00.000Z',
  }

  it('requires login', async () => {
    expect((await rejection(mutation('createBattle')({}, args, anonymous))).extensions.code).toBe('UNAUTHENTICATED')
  })

  it('rejects blank or over-long title and type, bad dates, and reversed dates', async () => {
    for (const bad of [
      { title: '   ' },
      { title: 'x'.repeat(101) },
      { type: '' },
      { type: 'x'.repeat(41) },
      { startDate: 'banana' },
      { endDate: 'banana' },
      { startDate: args.endDate, endDate: args.startDate },
    ]) {
      const e = await rejection(mutation('createBattle')({}, { ...args, ...bad }, asUser))
      expect(e.extensions.code).toBe('BAD_USER_INPUT')
    }
    expect(m.battleCreate).not.toHaveBeenCalled()
  })

  it('creates the battle with cleaned values and real Date objects', async () => {
    m.battleCreate.mockResolvedValue({ id: 'b' })
    await mutation('createBattle')({}, args, asUser)
    const data = m.battleCreate.mock.calls[0][0].data
    expect(data.title).toBe('Summer Showdown')
    expect(data.type).toBe('Scratch')
    expect(data.startDate).toBeInstanceOf(Date)
    expect(data.endDate).toBeInstanceOf(Date)
  })
})

describe('updateProfile', () => {
  const current = { username: 'dj_old', image: 'https://cdn.example.com/avatars/user-1/a.png', externalCrews: ['Crew A'] }
  beforeEach(() => {
    m.userFindUnique.mockResolvedValue(current)
    m.userFindFirst.mockResolvedValue(null)
    m.userUpdate.mockResolvedValue({ id: 'user-1' })
  })
  afterEach(() => vi.unstubAllEnvs())
  const update = (args: object) => mutation('updateProfile')({}, args, asUser)

  it('requires login', async () => {
    expect((await rejection(mutation('updateProfile')({}, { username: 'abc' }, anonymous))).extensions.code).toBe('UNAUTHENTICATED')
  })

  it('still rejects an empty username', async () => {
    expect((await rejection(update({ username: '' }))).message).toMatch(/empty/i)
  })

  it('rejects an invalid new username', async () => {
    for (const username of ['a b', 'ab', 'x'.repeat(31), 'dj$', 'admin', 'Ad_min']) {
      expect((await rejection(update({ username }))).extensions.code).toBe('BAD_USER_INPUT')
    }
    expect(m.userUpdate).not.toHaveBeenCalled()
  })

  it('checks username availability case-insensitively, excluding the caller', async () => {
    m.userFindFirst.mockResolvedValue({ id: 'someone-else' })
    const e = await rejection(update({ username: 'DJ_Cool' }))
    expect(e.message).toMatch(/taken/i)
    expect(m.userFindFirst).toHaveBeenCalledWith({
      where: { username: { equals: 'DJ_Cool', mode: 'insensitive' }, NOT: { id: 'user-1' } },
      select: { id: true },
    })
    expect(m.userUpdate).not.toHaveBeenCalled()
  })

  it('does not re-validate a username that has not changed (older accounts can still save)', async () => {
    m.userFindUnique.mockResolvedValue({ ...current, username: 'Old Name!' })
    await update({ username: 'Old Name!', externalCrews: ['Crew A'] })
    expect(m.userFindFirst).not.toHaveBeenCalled()
    expect(m.userUpdate).toHaveBeenCalled()
  })

  it('rejects http and script image links', async () => {
    for (const image of ['http://x.example.com/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA']) {
      expect((await rejection(update({ image }))).extensions.code).toBe('BAD_USER_INPUT')
    }
    expect(m.userUpdate).not.toHaveBeenCalled()
  })

  it('stores an empty image as null (no avatar)', async () => {
    await update({ image: '' })
    expect(m.userUpdate.mock.calls[0][0].data.image).toBeNull()
  })

  it('accepts a normal https image', async () => {
    await update({ image: 'https://cdn.example.com/avatars/user-1/b.png' })
    expect(m.userUpdate.mock.calls[0][0].data.image).toBe('https://cdn.example.com/avatars/user-1/b.png')
  })

  it('enforces ALLOWED_IMAGE_HOSTS when it is set, but keeps an unchanged image', async () => {
    vi.stubEnv('ALLOWED_IMAGE_HOSTS', 'cdn.example.com,*.googleusercontent.com')
    expect((await rejection(update({ image: 'https://evil.example.net/a.png' }))).extensions.code).toBe('BAD_USER_INPUT')
    await update({ image: 'https://lh3.googleusercontent.com/a/abc' })
    expect(m.userUpdate).toHaveBeenCalledTimes(1)

    m.userUpdate.mockClear()
    m.userFindUnique.mockResolvedValue({ ...current, image: 'https://legacy.example.org/old.png' })
    await update({ image: 'https://legacy.example.org/old.png' }) // unchanged -> allowed
    expect(m.userUpdate).toHaveBeenCalledTimes(1)
  })

  it('cleans crews, and rejects too many or over-long ones', async () => {
    await update({ externalCrews: [' Crew B ', 'crew b', 'Crew C'] })
    expect(m.userUpdate.mock.calls[0][0].data.externalCrews).toEqual(['Crew B', 'Crew C'])
    expect((await rejection(update({ externalCrews: Array.from({ length: 11 }, (_, i) => `C${i}`) }))).extensions.code).toBe('BAD_USER_INPUT')
    expect((await rejection(update({ externalCrews: ['x'.repeat(41)] }))).extensions.code).toBe('BAD_USER_INPUT')
  })

  it('does not re-validate crews that have not changed', async () => {
    const legacyCrews = Array.from({ length: 12 }, (_, i) => `Legacy crew ${i}`)
    m.userFindUnique.mockResolvedValue({ ...current, externalCrews: legacyCrews })
    await update({ externalCrews: legacyCrews })
    expect(m.userUpdate).toHaveBeenCalled()
  })

  it('only ever updates the caller\'s own record', async () => {
    await update({ username: 'new_handle' })
    expect(m.userUpdate.mock.calls[0][0].where).toEqual({ id: 'user-1' })
  })
})
