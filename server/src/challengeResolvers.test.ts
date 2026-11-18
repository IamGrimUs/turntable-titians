import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Everything the resolvers do inside createChallenge's transaction goes through `tx`, a separate
// object from `db`, so the tests prove the checks and the create share one transaction.
const { tx } = vi.hoisted(() => ({
  tx: {
    user: { findUnique: vi.fn() },
    challenge: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('./db', () => ({
  db: {
    $transaction: vi.fn(),
    user: { findUnique: vi.fn() },
    challenge: {
      create: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

import { db } from './db'
import { challengeFields, challengeMutation, challengeQuery } from './challengeResolvers'

const fn = (f: unknown) => f as ReturnType<typeof vi.fn>
const transaction = fn(db.$transaction)
const dbUserFind = fn(db.user.findUnique)
const chCreate = fn(db.challenge.create)
const chCount = fn(db.challenge.count)
const chFindFirst = fn(db.challenge.findFirst)
const chFindMany = fn(db.challenge.findMany)
const chFindUnique = fn(db.challenge.findUnique)
const chUpdateMany = fn(db.challenge.updateMany)
const txUserFind = fn(tx.user.findUnique)
const txCount = fn(tx.challenge.count)
const txFindFirst = fn(tx.challenge.findFirst)
const txCreate = fn(tx.challenge.create)

/* eslint-disable @typescript-eslint/no-explicit-any */
const m = challengeMutation as Record<string, (...args: any[]) => Promise<any>>
const q = challengeQuery as Record<string, (...args: any[]) => Promise<any>>
const f = challengeFields as Record<string, (...args: any[]) => any>
/* eslint-enable @typescript-eslint/no-explicit-any */

const NOW = new Date(2026, 5, 10, 12)
const DAY = 24 * 60 * 60 * 1000
const SECRET_URL = 'https://youtube.com/watch?v=secret-entry'

const anonymous = { userId: null }
const asMe = { userId: 'me', role: 'USER' as const, username: 'djme' }
const asOpponent = { userId: 'opp', role: 'USER' as const, username: 'djopp' }
const asStranger = { userId: 'stranger', role: 'USER' as const, username: 'djx' }
const suspended = { userId: 'me', role: 'USER' as const, username: 'djme', suspension: { reason: 'spam', until: null } }
const noUsername = { userId: 'me', role: 'USER' as const, username: null }

const validArgs = {
  opponentUsername: 'djopp',
  title: 'Scratch showdown',
  message: 'Let us settle it',
  videoUrl: SECRET_URL,
  votingDays: 7,
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    challengerId: 'me',
    opponentId: 'opp',
    title: 'Scratch showdown',
    message: 'Let us settle it',
    votingDays: 7,
    status: 'PENDING',
    expiresAt: new Date(NOW.getTime() + 5 * DAY),
    respondedAt: null,
    battleId: null,
    createdAt: new Date(NOW.getTime() - DAY),
    ...over,
  }
}

const msg = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: Error & { extensions?: { code?: string } }) => ({ message: e.message, code: e.extensions?.code })
  )

function expectNoDbUse() {
  for (const x of [
    transaction, dbUserFind, chCreate, chCount, chFindFirst, chFindMany, chFindUnique, chUpdateMany,
    txUserFind, txCount, txFindFirst, txCreate,
  ]) {
    expect(x).not.toHaveBeenCalled()
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
  txUserFind.mockResolvedValue({ id: 'opp', suspendedAt: null, suspendedUntil: null })
  txCount.mockResolvedValue(0)
  txFindFirst.mockResolvedValue(null)
  txCreate.mockResolvedValue(row())
  chUpdateMany.mockResolvedValue({ count: 1 })
})
afterEach(() => vi.useRealTimers())

describe('createChallenge', () => {
  it('refuses an anonymous caller before any database call', async () => {
    expect(await msg(m.createChallenge({}, validArgs, anonymous))).toEqual({
      message: 'Not authenticated',
      code: 'UNAUTHENTICATED',
    })
    expectNoDbUse()
  })

  it('refuses a suspended caller before any database call', async () => {
    expect((await msg(m.createChallenge({}, validArgs, suspended)))?.code).toBe('FORBIDDEN')
    expectNoDbUse()
  })

  it('rejects bad input (a link in the title) before any database call', async () => {
    const r = await msg(m.createChallenge({}, { ...validArgs, title: 'see https://evil.example' }, asMe))
    expect(r).toEqual({ message: "Title can't contain links.", code: 'BAD_USER_INPUT' })
    expectNoDbUse()
  })

  it('rejects a bad voting length before any database call', async () => {
    expect((await msg(m.createChallenge({}, { ...validArgs, votingDays: 5 }, asMe)))?.code).toBe('BAD_USER_INPUT')
    expectNoDbUse()
  })

  it('asks a caller without a username to choose one first', async () => {
    expect(await msg(m.createChallenge({}, validArgs, noUsername))).toEqual({
      message: 'Choose a username before challenging someone.',
      code: 'BAD_USER_INPUT',
    })
    expectNoDbUse()
  })

  it('refuses an unknown username', async () => {
    txUserFind.mockResolvedValue(null)
    expect(await msg(m.createChallenge({}, validArgs, asMe))).toEqual({
      message: 'No DJ with that username.',
      code: 'BAD_USER_INPUT',
    })
    expect(txCreate).not.toHaveBeenCalled()
  })

  it('refuses challenging yourself', async () => {
    txUserFind.mockResolvedValue({ id: 'me', suspendedAt: null, suspendedUntil: null })
    expect(await msg(m.createChallenge({}, { ...validArgs, opponentUsername: 'djme' }, asMe))).toEqual({
      message: "You can't challenge yourself.",
      code: 'BAD_USER_INPUT',
    })
    expect(txCreate).not.toHaveBeenCalled()
  })

  it('refuses an opponent who is suspended now', async () => {
    txUserFind.mockResolvedValue({ id: 'opp', suspendedAt: new Date(NOW.getTime() - DAY), suspendedUntil: null })
    expect(await msg(m.createChallenge({}, validArgs, asMe))).toEqual({
      message: "That DJ can't be challenged right now.",
      code: 'BAD_USER_INPUT',
    })
    expect(txCreate).not.toHaveBeenCalled()
  })

  it('allows an opponent whose suspension has ended', async () => {
    txUserFind.mockResolvedValue({
      id: 'opp',
      suspendedAt: new Date(NOW.getTime() - 5 * DAY),
      suspendedUntil: new Date(NOW.getTime() - DAY),
    })
    await m.createChallenge({}, validArgs, asMe)
    expect(txCreate).toHaveBeenCalled()
  })

  describe('block reasons', () => {
    function counts({ pending = 0, today = 0 } = {}) {
      txCount.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        'createdAt' in where ? today : pending
      )
    }
    function finds({ pair = null, declined = null }: { pair?: unknown; declined?: unknown } = {}) {
      txFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        where.status === 'DECLINED' ? declined : pair
      )
    }

    it('blocks when this pair already has a challenge waiting', async () => {
      finds({ pair: { id: 'other' } })
      expect(await msg(m.createChallenge({}, validArgs, asMe))).toEqual({
        message: 'You already have a challenge with this DJ waiting.',
        code: 'BAD_USER_INPUT',
      })
      expect(txCreate).not.toHaveBeenCalled()
    })

    it('looks for a waiting challenge in BOTH directions, only PENDING and not expired', async () => {
      await m.createChallenge({}, validArgs, asMe)
      const pairCall = txFindFirst.mock.calls.map((c) => c[0]).find((a) => a.where.status === 'PENDING')
      expect(pairCall.where.status).toBe('PENDING')
      expect(pairCall.where.expiresAt).toEqual({ gt: NOW })
      expect(pairCall.where.OR).toEqual(
        expect.arrayContaining([
          { challengerId: 'me', opponentId: 'opp' },
          { challengerId: 'opp', opponentId: 'me' },
        ])
      )
      expect(pairCall.where.OR).toHaveLength(2)
    })

    it('blocks during the cooldown after this DJ declined', async () => {
      finds({ declined: { respondedAt: new Date(NOW.getTime() - 2 * DAY) } })
      const r = await msg(m.createChallenge({}, validArgs, asMe))
      expect(r?.code).toBe('BAD_USER_INPUT')
      expect(r?.message).toMatch(/^This DJ declined your last challenge\. You can try again on /)
      expect(txCreate).not.toHaveBeenCalled()
    })

    it('reads the latest decline of this exact pair (same challenger, same opponent)', async () => {
      await m.createChallenge({}, validArgs, asMe)
      const call = txFindFirst.mock.calls.map((c) => c[0]).find((a) => a.where.status === 'DECLINED')
      expect(call.where).toMatchObject({ challengerId: 'me', opponentId: 'opp', status: 'DECLINED' })
      expect(call.orderBy).toEqual({ respondedAt: 'desc' })
    })

    it('allows a challenge once the cooldown is over', async () => {
      finds({ declined: { respondedAt: new Date(NOW.getTime() - 8 * DAY) } })
      await m.createChallenge({}, validArgs, asMe)
      expect(txCreate).toHaveBeenCalled()
    })

    it('blocks at 3 challenges waiting, counting only my PENDING, unexpired ones', async () => {
      counts({ pending: 3 })
      const r = await msg(m.createChallenge({}, validArgs, asMe))
      expect(r?.message).toBe(
        'You have 3 challenges waiting for an answer. Wait for a reply or withdraw one.'
      )
      expect(r?.code).toBe('BAD_USER_INPUT')
      expect(txCount).toHaveBeenCalledWith({
        where: { challengerId: 'me', status: 'PENDING', expiresAt: { gt: NOW } },
      })
      expect(txCreate).not.toHaveBeenCalled()
    })

    it('blocks at 5 created in the last 24 hours', async () => {
      counts({ today: 5 })
      const r = await msg(m.createChallenge({}, validArgs, asMe))
      expect(r).toEqual({ message: 'You can send 5 challenges a day. Try again tomorrow.', code: 'BAD_USER_INPUT' })
      expect(txCount).toHaveBeenCalledWith({
        where: { challengerId: 'me', createdAt: { gte: new Date(NOW.getTime() - DAY) } },
      })
    })
  })

  it('creates the challenge with the expiry, the stored video url and the cleaned fields', async () => {
    const result = await m.createChallenge({}, { ...validArgs, opponentUsername: '  djopp ' }, asMe)
    expect(txUserFind).toHaveBeenCalledWith(expect.objectContaining({ where: { username: 'djopp' } }))
    expect(txCreate).toHaveBeenCalledTimes(1)
    expect(txCreate.mock.calls[0][0].data).toEqual({
      challengerId: 'me',
      opponentId: 'opp',
      title: 'Scratch showdown',
      message: 'Let us settle it',
      challengerVideoUrl: SECRET_URL,
      votingDays: 7,
      expiresAt: new Date(NOW.getTime() + 10 * DAY),
    })
    expect(result).toEqual(row())
  })

  it('never selects the video url when it reads the new row back', async () => {
    await m.createChallenge({}, validArgs, asMe)
    expect(txCreate.mock.calls[0][0].select).toBeDefined()
    expect(txCreate.mock.calls[0][0].select.challengerVideoUrl).toBeUndefined()
  })

  it('runs the checks and the create in ONE serializable transaction, and nothing outside it', async () => {
    await m.createChallenge({}, validArgs, asMe)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' })
    expect(txUserFind).toHaveBeenCalled()
    expect(txCount).toHaveBeenCalled()
    expect(txFindFirst).toHaveBeenCalled()
    expect(txCreate).toHaveBeenCalled()
    expect(dbUserFind).not.toHaveBeenCalled()
    expect(chCount).not.toHaveBeenCalled()
    expect(chFindFirst).not.toHaveBeenCalled()
    expect(chCreate).not.toHaveBeenCalled()
  })

  it('turns a serialization failure (P2034) into a friendly retry message', async () => {
    transaction.mockRejectedValue(Object.assign(new Error('write conflict'), { code: 'P2034' }))
    expect(await msg(m.createChallenge({}, validArgs, asMe))).toEqual({
      message: 'Something went wrong, please try again.',
      code: 'BAD_USER_INPUT',
    })
  })

  it('lets other database errors through unchanged (the formatter hides them)', async () => {
    transaction.mockRejectedValue(Object.assign(new Error('connection lost'), { code: 'P1001' }))
    expect((await msg(m.createChallenge({}, validArgs, asMe)))?.message).toBe('connection lost')
  })

  it('never puts the video url in an error message', async () => {
    txUserFind.mockResolvedValue(null)
    const r = await msg(m.createChallenge({}, validArgs, asMe))
    expect(r?.message).not.toContain('secret-entry')
  })
})

describe('declineChallenge', () => {
  beforeEach(() => {
    chFindUnique.mockResolvedValue(row())
  })

  it('refuses anonymous and suspended callers before any database call', async () => {
    expect((await msg(m.declineChallenge({}, { id: 'c1' }, anonymous)))?.code).toBe('UNAUTHENTICATED')
    expect((await msg(m.declineChallenge({}, { id: 'c1' }, suspended)))?.code).toBe('FORBIDDEN')
    expectNoDbUse()
  })

  it('answers NOT_FOUND "Challenge not found" for a missing id', async () => {
    chFindUnique.mockResolvedValue(null)
    expect(await msg(m.declineChallenge({}, { id: 'nope' }, asOpponent))).toEqual({
      message: 'Challenge not found',
      code: 'NOT_FOUND',
    })
    expect(chUpdateMany).not.toHaveBeenCalled()
  })

  it('answers the same NOT_FOUND to a stranger', async () => {
    expect(await msg(m.declineChallenge({}, { id: 'c1' }, asStranger))).toEqual({
      message: 'Challenge not found',
      code: 'NOT_FOUND',
    })
    expect(chUpdateMany).not.toHaveBeenCalled()
  })

  it('tells the challenger only the challenged DJ can decline', async () => {
    expect(await msg(m.declineChallenge({}, { id: 'c1' }, asMe))).toEqual({
      message: 'Only the DJ who was challenged can decline.',
      code: 'BAD_USER_INPUT',
    })
    expect(chUpdateMany).not.toHaveBeenCalled()
  })

  it('declines with a compare-and-set on PENDING and not expired', async () => {
    const declined = row({ status: 'DECLINED', respondedAt: NOW })
    chFindUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(declined)
    const result = await m.declineChallenge({}, { id: 'c1' }, asOpponent)
    expect(chUpdateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'PENDING', expiresAt: { gt: NOW } },
      data: { status: 'DECLINED', respondedAt: NOW },
    })
    expect(result).toEqual(declined)
  })

  it('reports "no longer waiting" when the compare-and-set matches nothing (lost a race or expired)', async () => {
    chUpdateMany.mockResolvedValue({ count: 0 })
    expect(await msg(m.declineChallenge({}, { id: 'c1' }, asOpponent))).toEqual({
      message: 'This challenge is no longer waiting for an answer.',
      code: 'BAD_USER_INPUT',
    })
  })

  it('cannot decline an expired challenge (the update never matches)', async () => {
    chFindUnique.mockResolvedValue(row({ expiresAt: new Date(NOW.getTime() - 1000) }))
    chUpdateMany.mockResolvedValue({ count: 0 })
    expect((await msg(m.declineChallenge({}, { id: 'c1' }, asOpponent)))?.message).toBe(
      'This challenge is no longer waiting for an answer.'
    )
    expect(chUpdateMany.mock.calls[0][0].where.expiresAt).toEqual({ gt: NOW })
  })

  it('never selects the video url', async () => {
    await m.declineChallenge({}, { id: 'c1' }, asOpponent)
    for (const call of chFindUnique.mock.calls) {
      expect(call[0].select?.challengerVideoUrl).toBeUndefined()
      expect(call[0].select).toBeDefined()
    }
  })
})

describe('withdrawChallenge', () => {
  beforeEach(() => {
    chFindUnique.mockResolvedValue(row())
  })

  it('refuses anonymous and suspended callers before any database call', async () => {
    expect((await msg(m.withdrawChallenge({}, { id: 'c1' }, anonymous)))?.code).toBe('UNAUTHENTICATED')
    expect((await msg(m.withdrawChallenge({}, { id: 'c1' }, suspended)))?.code).toBe('FORBIDDEN')
    expectNoDbUse()
  })

  it('answers NOT_FOUND for a missing id and for a stranger, with the same message', async () => {
    const stranger = await msg(m.withdrawChallenge({}, { id: 'c1' }, asStranger))
    chFindUnique.mockResolvedValue(null)
    const missing = await msg(m.withdrawChallenge({}, { id: 'nope' }, asMe))
    expect(stranger).toEqual({ message: 'Challenge not found', code: 'NOT_FOUND' })
    expect(missing).toEqual(stranger)
    expect(chUpdateMany).not.toHaveBeenCalled()
  })

  it('tells the challenged DJ only the sender can withdraw', async () => {
    expect(await msg(m.withdrawChallenge({}, { id: 'c1' }, asOpponent))).toEqual({
      message: 'Only the DJ who sent the challenge can withdraw it.',
      code: 'BAD_USER_INPUT',
    })
    expect(chUpdateMany).not.toHaveBeenCalled()
  })

  it('withdraws with a compare-and-set on PENDING and not expired', async () => {
    const withdrawn = row({ status: 'WITHDRAWN', respondedAt: NOW })
    chFindUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(withdrawn)
    const result = await m.withdrawChallenge({}, { id: 'c1' }, asMe)
    expect(chUpdateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'PENDING', expiresAt: { gt: NOW } },
      data: { status: 'WITHDRAWN', respondedAt: NOW },
    })
    expect(result).toEqual(withdrawn)
  })

  it('reports "no longer waiting" when the compare-and-set matches nothing', async () => {
    chUpdateMany.mockResolvedValue({ count: 0 })
    expect(await msg(m.withdrawChallenge({}, { id: 'c1' }, asMe))).toEqual({
      message: 'This challenge is no longer waiting for an answer.',
      code: 'BAD_USER_INPUT',
    })
  })

  it('cannot withdraw an expired challenge', async () => {
    chFindUnique.mockResolvedValue(row({ expiresAt: new Date(NOW.getTime() - 1000) }))
    chUpdateMany.mockResolvedValue({ count: 0 })
    expect((await msg(m.withdrawChallenge({}, { id: 'c1' }, asMe)))?.code).toBe('BAD_USER_INPUT')
  })
})

describe('Query.challenge', () => {
  it('returns the challenge to the challenger and to the opponent', async () => {
    chFindUnique.mockResolvedValue(row())
    expect(await q.challenge({}, { id: 'c1' }, asMe)).toEqual(row())
    expect(await q.challenge({}, { id: 'c1' }, asOpponent)).toEqual(row())
  })

  it('answers NOT_FOUND to a stranger, to anonymous and for a missing id with one identical message', async () => {
    chFindUnique.mockResolvedValue(row())
    const stranger = await msg(q.challenge({}, { id: 'c1' }, asStranger))
    const anon = await msg(q.challenge({}, { id: 'c1' }, anonymous))
    chFindUnique.mockResolvedValue(null)
    const missing = await msg(q.challenge({}, { id: 'zzz' }, asMe))
    expect(stranger).toEqual({ message: 'Challenge not found', code: 'NOT_FOUND' })
    expect(anon).toEqual(stranger)
    expect(missing).toEqual(stranger)
  })

  it('does not even query for an anonymous caller', async () => {
    await msg(q.challenge({}, { id: 'c1' }, anonymous))
    expect(chFindUnique).not.toHaveBeenCalled()
  })

  it('never selects the video url', async () => {
    chFindUnique.mockResolvedValue(row())
    await q.challenge({}, { id: 'c1' }, asOpponent)
    const sel = chFindUnique.mock.calls[0][0].select
    expect(sel).toBeDefined()
    expect(sel.challengerVideoUrl).toBeUndefined()
  })
})

describe('Query.myChallenges', () => {
  it('returns [] for anonymous without a query', async () => {
    expect(await q.myChallenges({}, {}, anonymous)).toEqual([])
    expect(chFindMany).not.toHaveBeenCalled()
  })

  it('lists only the caller\'s own, newest first, at most 50, without the video url', async () => {
    chFindMany.mockResolvedValue([row()])
    expect(await q.myChallenges({}, {}, asMe)).toEqual([row()])
    const arg = chFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ OR: [{ challengerId: 'me' }, { opponentId: 'me' }] })
    expect(arg.orderBy).toEqual({ createdAt: 'desc' })
    expect(arg.take).toBe(50)
    expect(arg.select.challengerVideoUrl).toBeUndefined()
  })
})

describe('Query.challengesWaiting', () => {
  it('is 0 for anonymous without a query', async () => {
    expect(await q.challengesWaiting({}, {}, anonymous)).toBe(0)
    expect(chCount).not.toHaveBeenCalled()
  })

  it('counts only challenges sent to me that are PENDING and not expired', async () => {
    chCount.mockResolvedValue(2)
    expect(await q.challengesWaiting({}, {}, asMe)).toBe(2)
    expect(chCount).toHaveBeenCalledWith({
      where: { opponentId: 'me', status: 'PENDING', expiresAt: { gt: NOW } },
    })
  })
})

describe('Challenge fields', () => {
  describe('challengerVideoUrl (the fairness rule)', () => {
    beforeEach(() => {
      chFindUnique.mockResolvedValue({ challengerVideoUrl: SECRET_URL })
    })

    it('is the url for the challenger while the challenge is effectively PENDING', async () => {
      expect(await f.challengerVideoUrl(row(), {}, asMe)).toBe(SECRET_URL)
      expect(chFindUnique).toHaveBeenCalledWith({ where: { id: 'c1' }, select: { challengerVideoUrl: true } })
    })

    it('is null for the opponent even while PENDING, and the url is never even read', async () => {
      expect(await f.challengerVideoUrl(row(), {}, asOpponent)).toBeNull()
      expect(chFindUnique).not.toHaveBeenCalled()
    })

    it('is null for anonymous, and never read', async () => {
      expect(await f.challengerVideoUrl(row(), {}, anonymous)).toBeNull()
      expect(chFindUnique).not.toHaveBeenCalled()
    })

    it('is null for a stranger, and never read', async () => {
      expect(await f.challengerVideoUrl(row(), {}, asStranger)).toBeNull()
      expect(chFindUnique).not.toHaveBeenCalled()
    })

    it.each(['ACCEPTED', 'DECLINED', 'WITHDRAWN'])('is null for the challenger once %s', async (status) => {
      expect(await f.challengerVideoUrl(row({ status }), {}, asMe)).toBeNull()
      expect(chFindUnique).not.toHaveBeenCalled()
    })

    it('is null for the challenger once EXPIRED', async () => {
      const expired = row({ expiresAt: new Date(NOW.getTime() - 1) })
      expect(await f.challengerVideoUrl(expired, {}, asMe)).toBeNull()
      expect(chFindUnique).not.toHaveBeenCalled()
    })

    it('is null when the row has gone missing', async () => {
      chFindUnique.mockResolvedValue(null)
      expect(await f.challengerVideoUrl(row(), {}, asMe)).toBeNull()
    })

    it('ignores a url that happens to be on the parent row when the caller is not the challenger', async () => {
      expect(await f.challengerVideoUrl(row({ challengerVideoUrl: SECRET_URL }), {}, asOpponent)).toBeNull()
    })
  })

  it('status goes through effectiveStatus', () => {
    expect(f.status(row())).toBe('PENDING')
    expect(f.status(row({ expiresAt: new Date(NOW.getTime() - 1) }))).toBe('EXPIRED')
    expect(f.status(row({ status: 'ACCEPTED' }))).toBe('ACCEPTED')
  })

  it('viewerRole is the caller\'s side', () => {
    expect(f.viewerRole(row(), {}, asMe)).toBe('CHALLENGER')
    expect(f.viewerRole(row(), {}, asOpponent)).toBe('OPPONENT')
  })

  it('battleId is null unless ACCEPTED', () => {
    expect(f.battleId(row({ battleId: 'b1', status: 'ACCEPTED' }))).toBe('b1')
    expect(f.battleId(row({ battleId: 'b1', status: 'WITHDRAWN' }))).toBeNull()
    expect(f.battleId(row())).toBeNull()
  })

  it('message is null when there is none', () => {
    expect(f.message(row({ message: null }))).toBeNull()
    expect(f.message(row())).toBe('Let us settle it')
  })

  it('dates are ISO strings, respondedAt null until answered', () => {
    expect(f.expiresAt(row())).toBe(row().expiresAt.toISOString())
    expect(f.createdAt(row())).toBe(row().createdAt.toISOString())
    expect(f.respondedAt(row())).toBeNull()
    expect(f.respondedAt(row({ respondedAt: NOW }))).toBe(NOW.toISOString())
  })

  it('challenger and opponent load the two users', async () => {
    dbUserFind.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id }))
    expect(await f.challenger(row())).toEqual({ id: 'me' })
    expect(await f.opponent(row())).toEqual({ id: 'opp' })
  })
})
