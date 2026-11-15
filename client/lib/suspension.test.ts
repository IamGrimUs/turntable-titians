import { describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'
import { isActiveUser, isSuspendedNow, readSuspensionNotice, signSuspensionNotice } from './suspension'

const NOW = new Date('2026-11-15T12:00:00Z')
const SECRET = 'a-test-secret-that-is-long-enough'

describe('isSuspendedNow', () => {
  it('is false when the user was never suspended', () => {
    expect(isSuspendedNow({ suspendedAt: null, suspendedUntil: null }, NOW)).toBe(false)
  })
  it('is true for an open-ended suspension', () => {
    expect(isSuspendedNow({ suspendedAt: new Date('2026-11-01'), suspendedUntil: null }, NOW)).toBe(true)
  })
  it('is true while suspendedUntil is in the future', () => {
    expect(
      isSuspendedNow({ suspendedAt: new Date('2026-11-01'), suspendedUntil: new Date('2026-11-20') }, NOW)
    ).toBe(true)
  })
  it('is false once suspendedUntil has passed', () => {
    expect(
      isSuspendedNow({ suspendedAt: new Date('2026-11-01'), suspendedUntil: new Date('2026-11-10') }, NOW)
    ).toBe(false)
  })
})

describe('isActiveUser', () => {
  it('is false when the row is missing (deleted user)', () => {
    expect(isActiveUser(null, NOW)).toBe(false)
  })
  it('is true for a user who was never suspended', () => {
    expect(isActiveUser({ suspendedAt: null, suspendedUntil: null }, NOW)).toBe(true)
  })
  it('is false while suspended, open-ended or timed', () => {
    expect(isActiveUser({ suspendedAt: new Date('2026-11-01'), suspendedUntil: null }, NOW)).toBe(false)
    expect(
      isActiveUser({ suspendedAt: new Date('2026-11-01'), suspendedUntil: new Date('2026-11-20') }, NOW)
    ).toBe(false)
  })
  it('is true again once a timed suspension has passed', () => {
    expect(
      isActiveUser({ suspendedAt: new Date('2026-11-01'), suspendedUntil: new Date('2026-11-10') }, NOW)
    ).toBe(true)
  })
})

describe('suspension notice', () => {
  it('round-trips the user id', async () => {
    const token = await signSuspensionNotice('user-1', SECRET, Date.now())
    expect(await readSuspensionNotice(token, SECRET)).toBe('user-1')
  })

  it('reads as null when signed with another secret', async () => {
    const token = await signSuspensionNotice('user-1', 'another-secret-another-secret-xx')
    expect(await readSuspensionNotice(token, SECRET)).toBeNull()
  })

  it('reads as null when tampered with', async () => {
    const token = await signSuspensionNotice('user-1', SECRET)
    const [h, p, s] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ userId: 'user-2' })).toString('base64url')
    expect(p).not.toBe(forged)
    expect(await readSuspensionNotice(`${h}.${forged}.${s}`, SECRET)).toBeNull()
  })

  it('reads as null when expired', async () => {
    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000
    const token = await signSuspensionNotice('user-1', SECRET, elevenMinutesAgo)
    expect(await readSuspensionNotice(token, SECRET)).toBeNull()
  })

  it('reads as null for garbage and for an empty string', async () => {
    expect(await readSuspensionNotice('garbage', SECRET)).toBeNull()
    expect(await readSuspensionNotice('', SECRET)).toBeNull()
  })

  it('reads as null for a token without a userId or with a non-HS256 algorithm', async () => {
    const key = new TextEncoder().encode(SECRET)
    const noId = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('10m').sign(key)
    expect(await readSuspensionNotice(noId, SECRET)).toBeNull()
    const hs512 = await new SignJWT({ userId: 'user-1' })
      .setProtectedHeader({ alg: 'HS512' })
      .setExpirationTime('10m')
      .sign(key)
    expect(await readSuspensionNotice(hs512, SECRET)).toBeNull()
  })
})
