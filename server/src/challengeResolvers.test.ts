import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Everything the resolvers do inside createChallenge's transaction goes through `tx`, a separate
// object from `db`, so the tests prove the checks and the create share one transaction.
const { tx } = vi.hoisted(() => ({
  tx: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    challenge: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    battle: { create: vi.fn() },
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

vi.mock('./challengeEmail', () => ({ notifyChallenge: vi.fn() }))

import { db } from './db'
import { notifyChallenge } from './challengeEmail'
import {
  challengeFields,
  challengeMutation,
  challengeQuery,
  SAFE_SELECT,
  notFound,
  isSerializationFailure,
} from './challengeResolvers'

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
const txUserFindFirst = fn(tx.user.findFirst)
const txUpdateMany = fn(tx.challenge.updateMany)
const txChFindUnique = fn(tx.challenge.findUnique)
const txChUpdate = fn(tx.challenge.update)
const txBattleCreate = fn(tx.battle.create)
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
    txUserFind, txUserFindFirst, txCount, txFindFirst, txCreate,
    txUpdateMany, txChFindUnique, txChUpdate, txBattleCreate,
  ]) {
    expect(x).not.toHaveBeenCalled()
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
  txUserFindFirst.mockResolvedValue({ id: 'opp', suspendedAt: null, suspendedUntil: null })
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
    txUserFindFirst.mockResolvedValue(null)
    expect(await msg(m.createChallenge({}, validArgs, asMe))).toEqual({
      message: 'No DJ with that username.',
      code: 'BAD_USER_INPUT',
    })
    expect(txCreate).not.toHaveBeenCalled()
  })

  it('refuses challenging yourself', async () => {
    txUserFindFirst.mockResolvedValue({ id: 'me', suspendedAt: null, suspendedUntil: null })
    expect(await msg(m.createChallenge({}, { ...validArgs, opponentUsername: 'djme' }, asMe))).toEqual({
      message: "You can't challenge yourself.",
      code: 'BAD_USER_INPUT',
    })
    expect(txCreate).not.toHaveBeenCalled()
  })

  it('finds the opponent ignoring case, so typing "djopp" finds "DJOpp"', async () => {
    txUserFindFirst.mockResolvedValue({ id: 'opp', suspendedAt: null, suspendedUntil: null })
    await m.createChallenge({}, { ...validArgs, opponentUsername: 'djopp' }, asMe)
    expect(txUserFindFirst.mock.calls[0][0].where).toEqual({ username: { equals: 'djopp', mode: 'insensitive' } })
    expect(txUserFind).not.toHaveBeenCalled()
    expect(txCreate).toHaveBeenCalled()
  })

  it('refuses challenging yourself typed in different case (compares ids, not strings)', async () => {
    txUserFindFirst.mockResolvedValue({ id: 'me', suspendedAt: null, suspendedUntil: null })
    expect(await msg(m.createChallenge({}, { ...validArgs, opponentUsername: 'DJME' }, asMe))).toEqual({
      message: "You can't challenge yourself.",
      code: 'BAD_USER_INPUT',
    })
    expect(txCreate).not.toHaveBeenCalled()
  })

  it('refuses an opponent who is suspended now', async () => {
    txUserFindFirst.mockResolvedValue({ id: 'opp', suspendedAt: new Date(NOW.getTime() - DAY), suspendedUntil: null })
    expect(await msg(m.createChallenge({}, validArgs, asMe))).toEqual({
      message: "That DJ can't be challenged right now.",
      code: 'BAD_USER_INPUT',
    })
    expect(txCreate).not.toHaveBeenCalled()
  })

  it('allows an opponent whose suspension has ended', async () => {
    txUserFindFirst.mockResolvedValue({
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

    it('ignores declines with no respondedAt, so NULL ordering cannot skip the cooldown', async () => {
      await m.createChallenge({}, validArgs, asMe)
      const call = txFindFirst.mock.calls.map((c) => c[0]).find((a) => a.where.status === 'DECLINED')
      expect(call.where.respondedAt).toEqual({ not: null })
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
    expect(txUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: { equals: 'djopp', mode: 'insensitive' } } })
    )
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
    expect(txUserFindFirst).toHaveBeenCalled()
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

  describe('retries serialization failures', () => {
    const conflict = () => Object.assign(new Error('write conflict'), { code: 'P2034' })

    it('retries the whole transaction: P2034 twice, then success creates the challenge once and notifies once', async () => {
      const notify = fn(notifyChallenge)
      transaction
        .mockRejectedValueOnce(conflict())
        .mockRejectedValueOnce(conflict())
        .mockImplementationOnce(async (cb: (t: typeof tx) => unknown) => cb(tx))
      const result = await m.createChallenge({}, validArgs, asMe)
      expect(result).toEqual(row())
      expect(transaction).toHaveBeenCalledTimes(3)
      expect(txCreate).toHaveBeenCalledTimes(1)
      expect(notify).toHaveBeenCalledTimes(1)
      expect(notify).toHaveBeenCalledWith('CHALLENGED', 'c1')
    })

    it('gives up after three attempts with the friendly message, creating and notifying nothing', async () => {
      const notify = fn(notifyChallenge)
      transaction.mockRejectedValue(conflict())
      expect(await msg(m.createChallenge({}, validArgs, asMe))).toEqual({
        message: 'Something went wrong, please try again.',
        code: 'BAD_USER_INPUT',
      })
      expect(transaction).toHaveBeenCalledTimes(3)
      expect(txCreate).not.toHaveBeenCalled()
      expect(notify).not.toHaveBeenCalled()
    })

    it('does not retry any other error', async () => {
      transaction.mockRejectedValue(Object.assign(new Error('connection lost'), { code: 'P1001' }))
      await msg(m.createChallenge({}, validArgs, asMe))
      expect(transaction).toHaveBeenCalledTimes(1)
    })

    it('does not retry a refusal thrown inside the transaction', async () => {
      txCount.mockResolvedValue(3)
      await msg(m.createChallenge({}, validArgs, asMe))
      expect(transaction).toHaveBeenCalledTimes(1)
    })
  })

  it('never puts the video url in an error message', async () => {
    txUserFindFirst.mockResolvedValue(null)
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

describe('exports shared with acceptChallenge', () => {
  it('SAFE_SELECT omits the challenger video url', () => {
    expect((SAFE_SELECT as Record<string, unknown>).challengerVideoUrl).toBeUndefined()
    expect(SAFE_SELECT.id).toBe(true)
  })

  it('notFound is the one NOT_FOUND "Challenge not found"', () => {
    const e = notFound()
    expect(e.message).toBe('Challenge not found')
    expect(e.extensions.code).toBe('NOT_FOUND')
  })

  it('isSerializationFailure recognises P2034 only', () => {
    expect(isSerializationFailure({ code: 'P2034' })).toBe(true)
    expect(isSerializationFailure({ code: 'P2002' })).toBe(false)
    expect(isSerializationFailure(null)).toBe(false)
  })
})

describe('acceptChallenge', () => {
  const NEW_URL = 'https://youtube.com/watch?v=my-new-entry'
  const accepted = row({ status: 'ACCEPTED', respondedAt: NOW, battleId: 'b1' })

  beforeEach(() => {
    chFindUnique.mockResolvedValue(row())
    txChFindUnique.mockResolvedValue({
      challengerId: 'me',
      title: 'Scratch showdown',
      message: 'Let us settle it',
      votingDays: 7,
      challengerVideoUrl: SECRET_URL,
    })
    txUserFind.mockResolvedValue({ suspendedAt: null, suspendedUntil: null })
    txUpdateMany.mockResolvedValue({ count: 1 })
    txBattleCreate.mockResolvedValue({ id: 'b1' })
    txChUpdate.mockResolvedValue(accepted)
  })

  const accept = (ctx: unknown = asOpponent, args: Record<string, unknown> = {}) =>
    m.acceptChallenge({}, { id: 'c1', videoUrl: NEW_URL, ...args }, ctx)

  it('refuses anonymous and suspended callers before any database call', async () => {
    expect((await msg(accept(anonymous)))?.code).toBe('UNAUTHENTICATED')
    expect((await msg(accept(suspended)))?.code).toBe('FORBIDDEN')
    expectNoDbUse()
  })

  it.each([
    ['http link', 'http://youtube.com/watch?v=x'],
    ['empty', ''],
    ['blank', '   '],
    ['not a link', 'nope'],
  ])('rejects a bad video url (%s) before any database call', async (_name, url) => {
    expect((await msg(accept(asOpponent, { videoUrl: url })))?.code).toBe('BAD_USER_INPUT')
    expectNoDbUse()
  })

  it('rejects a video url over the length limit before any database call', async () => {
    const r = await msg(accept(asOpponent, { videoUrl: 'https://example.com/' + 'a'.repeat(600) }))
    expect(r?.code).toBe('BAD_USER_INPUT')
    expectNoDbUse()
  })

  it('answers NOT_FOUND "Challenge not found" for a missing id', async () => {
    chFindUnique.mockResolvedValue(null)
    expect(await msg(accept(asOpponent))).toEqual({ message: 'Challenge not found', code: 'NOT_FOUND' })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('answers the identical NOT_FOUND to a stranger, and nothing is written', async () => {
    const stranger = await msg(accept(asStranger))
    chFindUnique.mockResolvedValue(null)
    const missing = await msg(accept(asStranger))
    expect(stranger).toEqual({ message: 'Challenge not found', code: 'NOT_FOUND' })
    expect(missing).toEqual(stranger)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('tells the challenger they cannot accept their own challenge', async () => {
    expect(await msg(accept(asMe))).toEqual({
      message: "You can't accept your own challenge.",
      code: 'BAD_USER_INPUT',
    })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('never selects the video url in the pre-read', async () => {
    await accept()
    const sel = chFindUnique.mock.calls[0][0].select
    expect(sel).toBeDefined()
    expect(sel.challengerVideoUrl).toBeUndefined()
  })

  it.each([
    ['suspended now', { suspendedAt: new Date(NOW.getTime() - DAY), suspendedUntil: null }],
    ['gone', null],
  ])('refuses when the challenger is %s, and opens no battle', async (_name, challenger) => {
    txUserFind.mockResolvedValue(challenger)
    expect(await msg(accept())).toEqual({
      message: 'This challenge is no longer available.',
      code: 'BAD_USER_INPUT',
    })
    expect(txBattleCreate).not.toHaveBeenCalled()
    expect(txChUpdate).not.toHaveBeenCalled()
  })

  it('still accepts when the challenger suspension has ended', async () => {
    txUserFind.mockResolvedValue({
      suspendedAt: new Date(NOW.getTime() - 5 * DAY),
      suspendedUntil: new Date(NOW.getTime() - DAY),
    })
    await accept()
    expect(txBattleCreate).toHaveBeenCalledTimes(1)
  })

  it('does the compare-and-set first, inside the transaction, on PENDING, not expired and addressed to me', async () => {
    await accept()
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { id: 'c1', opponentId: 'opp', status: 'PENDING', expiresAt: { gt: NOW } },
      data: { status: 'ACCEPTED', respondedAt: NOW },
    })
    const order = (x: ReturnType<typeof vi.fn>) => x.mock.invocationCallOrder[0]
    expect(order(txUpdateMany)).toBeLessThan(order(txChFindUnique))
    expect(order(txChFindUnique)).toBeLessThan(order(txBattleCreate))
    expect(order(txBattleCreate)).toBeLessThan(order(txChUpdate))
    expect(chUpdateMany).not.toHaveBeenCalled()
  })

  it.each(['expired', 'declined', 'withdrawn', 'already accepted'])(
    'reports "no longer waiting" and writes nothing else when the compare-and-set matches nothing (%s)',
    async () => {
      txUpdateMany.mockResolvedValue({ count: 0 })
      expect(await msg(accept())).toEqual({
        message: 'This challenge is no longer waiting for an answer.',
        code: 'BAD_USER_INPUT',
      })
      expect(txBattleCreate).not.toHaveBeenCalled()
      expect(txChUpdate).not.toHaveBeenCalled()
      expect(txChFindUnique).not.toHaveBeenCalled()
    }
  )

  it('double accept: the second accept loses the compare-and-set and creates no battle', async () => {
    txUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    await accept()
    expect(txBattleCreate).toHaveBeenCalledTimes(1)
    const second = await msg(accept())
    expect(second?.message).toBe('This challenge is no longer waiting for an answer.')
    expect(txBattleCreate).toHaveBeenCalledTimes(1)
  })

  it('creates one Head to Head battle with the challenge title, message and the dates for the chosen length', async () => {
    await accept()
    expect(txBattleCreate).toHaveBeenCalledTimes(1)
    const data = txBattleCreate.mock.calls[0][0].data
    expect(data.title).toBe('Scratch showdown')
    expect(data.type).toBe('Head to Head')
    expect(data.description).toBe('Let us settle it')
    expect(data.startDate).toEqual(new Date(2026, 5, 10))
    expect(data.endDate).toEqual(new Date(2026, 5, 17))
  })

  it('uses the stored voting length (14 days) for the end date', async () => {
    txChFindUnique.mockResolvedValue({
      challengerId: 'me',
      title: 't',
      message: null,
      votingDays: 14,
      challengerVideoUrl: SECRET_URL,
    })
    await accept()
    const data = txBattleCreate.mock.calls[0][0].data
    expect(data.endDate).toEqual(new Date(2026, 5, 24))
    expect(data.description).toBeNull()
  })

  it('creates exactly two entries: the challenger with the stored url first, then me with the new url', async () => {
    await accept()
    const subs = txBattleCreate.mock.calls[0][0].data.submissions.create
    expect(subs).toHaveLength(2)
    expect(subs[0]).toEqual({ userId: 'me', videoUrl: SECRET_URL })
    expect(subs[1]).toEqual({ userId: 'opp', videoUrl: NEW_URL })
  })

  it('stores the cleaned (trimmed) new url', async () => {
    await accept(asOpponent, { videoUrl: `  ${NEW_URL}  ` })
    expect(txBattleCreate.mock.calls[0][0].data.submissions.create[1].videoUrl).toBe(NEW_URL)
  })

  it('reads the stored challenger url inside the transaction only', async () => {
    await accept()
    expect(txChFindUnique).toHaveBeenCalledTimes(1)
    expect(txChFindUnique.mock.calls[0][0].where).toEqual({ id: 'c1' })
    expect(txChFindUnique.mock.calls[0][0].select.challengerVideoUrl).toBe(true)
    for (const call of chFindUnique.mock.calls) expect(call[0].select.challengerVideoUrl).toBeUndefined()
  })

  it('links the battle to the challenge and returns the challenge with its battleId, without the video url', async () => {
    const result = await accept()
    expect(txChUpdate).toHaveBeenCalledTimes(1)
    expect(txChUpdate.mock.calls[0][0].where).toEqual({ id: 'c1' })
    expect(txChUpdate.mock.calls[0][0].data).toEqual({ battleId: 'b1' })
    expect(txChUpdate.mock.calls[0][0].select).toEqual(SAFE_SELECT)
    expect(result).toEqual(accepted)
    expect(f.battleId(result)).toBe('b1')
    expect(f.status(result)).toBe('ACCEPTED')
    expect(await f.challengerVideoUrl(result, {}, asOpponent)).toBeNull()
  })

  it('uses tx for every read and write, never db', async () => {
    await accept()
    expect(chUpdateMany).not.toHaveBeenCalled()
    expect(dbUserFind).not.toHaveBeenCalled()
    expect(chCreate).not.toHaveBeenCalled()
  })

  it('a failure creating the battle rejects with a generic error that holds neither video url', async () => {
    txBattleCreate.mockRejectedValue(
      new Error(`Invalid prisma.battle.create() invocation: videoUrl: "${SECRET_URL}" unique constraint`)
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await msg(accept())
    expect(r).not.toBeNull()
    expect(r?.message).not.toContain('secret-entry')
    expect(r?.message).not.toContain('my-new-entry')
    expect(r?.code).toBeUndefined()
    expect(txChUpdate).not.toHaveBeenCalled()
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret-entry')
    spy.mockRestore()
  })

  it('never puts the stored url in a deliberate error message', async () => {
    txUpdateMany.mockResolvedValue({ count: 0 })
    const a = await msg(accept())
    txUserFind.mockResolvedValue(null)
    txUpdateMany.mockResolvedValue({ count: 1 })
    const b = await msg(accept())
    for (const r of [a, b]) expect(r?.message).not.toContain('secret-entry')
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

describe('challenge emails (fire-and-forget after the commit)', () => {
  const notify = fn(notifyChallenge)
  const NEW_URL = 'https://youtube.com/watch?v=my-new-entry'
  let events: string[]

  beforeEach(() => {
    events = []
    notify.mockImplementation(async () => {
      events.push('notify')
    })
    transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => {
      events.push('tx-start')
      const result = await cb(tx)
      events.push('tx-end')
      return result
    })
    // accept
    txChFindUnique.mockResolvedValue({
      challengerId: 'me',
      title: 'Scratch showdown',
      message: 'Let us settle it',
      votingDays: 7,
      challengerVideoUrl: SECRET_URL,
    })
    txUserFind.mockResolvedValue({ suspendedAt: null, suspendedUntil: null })
    txUpdateMany.mockResolvedValue({ count: 1 })
    txBattleCreate.mockResolvedValue({ id: 'b1' })
    txChUpdate.mockResolvedValue(row({ status: 'ACCEPTED', respondedAt: NOW, battleId: 'b1' }))
    chFindUnique.mockResolvedValue(row())
  })

  const create = () => m.createChallenge({}, validArgs, asMe)
  const accept = () => m.acceptChallenge({}, { id: 'c1', videoUrl: NEW_URL }, asOpponent)
  const decline = () => m.declineChallenge({}, { id: 'c1' }, asOpponent)
  const withdraw = () => m.withdrawChallenge({}, { id: 'c1' }, asMe)

  it('createChallenge sends CHALLENGED for the new challenge, after the transaction has finished', async () => {
    await create()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith('CHALLENGED', 'c1')
    expect(events).toEqual(['tx-start', 'tx-end', 'notify'])
  })

  it('acceptChallenge sends ACCEPTED, after the transaction has finished', async () => {
    await accept()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith('ACCEPTED', 'c1')
    expect(events).toEqual(['tx-start', 'tx-end', 'notify'])
  })

  it('declineChallenge sends DECLINED once the decline is stored', async () => {
    chFindUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ status: 'DECLINED', respondedAt: NOW }))
    await decline()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith('DECLINED', 'c1')
  })

  it('withdrawChallenge sends nothing', async () => {
    chFindUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ status: 'WITHDRAWN', respondedAt: NOW }))
    await withdraw()
    expect(notify).not.toHaveBeenCalled()
  })

  it('sends nothing when the mutation itself fails', async () => {
    txCount.mockResolvedValue(3)
    expect(await msg(create())).not.toBeNull()

    txUpdateMany.mockResolvedValue({ count: 0 })
    expect(await msg(accept())).not.toBeNull()

    chUpdateMany.mockResolvedValue({ count: 0 })
    expect(await msg(decline())).not.toBeNull()

    expect(await msg(m.createChallenge({}, validArgs, anonymous))).not.toBeNull()
    expect(notify).not.toHaveBeenCalled()
  })

  it('a notifier that rejects never changes the mutation result', async () => {
    notify.mockRejectedValue(new Error('resend is down'))
    expect(await create()).toEqual(row())
    expect(await accept()).toEqual(row({ status: 'ACCEPTED', respondedAt: NOW, battleId: 'b1' }))
    chFindUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ status: 'DECLINED', respondedAt: NOW }))
    expect(await decline()).toEqual(row({ status: 'DECLINED', respondedAt: NOW }))
  })

  it('a notifier that throws synchronously never changes the mutation result', async () => {
    notify.mockImplementation(() => {
      throw new Error('sync boom')
    })
    expect(await create()).toEqual(row())
    expect(await accept()).toEqual(row({ status: 'ACCEPTED', respondedAt: NOW, battleId: 'b1' }))
    chFindUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ status: 'DECLINED', respondedAt: NOW }))
    expect(await decline()).toEqual(row({ status: 'DECLINED', respondedAt: NOW }))
  })

  it('does not wait for a slow notifier', async () => {
    notify.mockImplementation(() => new Promise(() => {})) // never settles
    expect(await create()).toEqual(row())
  })
})
