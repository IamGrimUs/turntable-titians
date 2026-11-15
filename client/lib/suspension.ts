/**
 * Suspension rules and the short-lived "suspension notice".
 *
 * isSuspendedNow() is the same rule as isSuspended() on the server. It is duplicated on
 * purpose: the two packages share no code.
 *
 * The notice is a signed, 10-minute token that carries only the user id. It lets the
 * "account suspended" page know which user to show the reason for, without putting the
 * reason (or anything else private) in a URL.
 */

import { jwtVerify, SignJWT } from 'jose'

export const SUSPENSION_NOTICE_SECONDS = 10 * 60

export function isSuspendedNow(
  row: { suspendedAt: Date | null; suspendedUntil: Date | null },
  now: Date = new Date()
): boolean {
  if (row.suspendedAt === null) return false
  if (row.suspendedUntil === null) return true
  return row.suspendedUntil.getTime() > now.getTime()
}

/**
 * True only for a user who exists and is not suspended right now. A missing row (deleted
 * user) is not active: their old session must not be able to do anything.
 */
export function isActiveUser(
  row: { suspendedAt: Date | null; suspendedUntil: Date | null } | null,
  now: Date = new Date()
): boolean {
  return row !== null && !isSuspendedNow(row, now)
}

export async function signSuspensionNotice(
  userId: string,
  secret: string,
  now: number = Date.now()
): Promise<string> {
  const issuedAt = Math.floor(now / 1000)
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SUSPENSION_NOTICE_SECONDS)
    .sign(new TextEncoder().encode(secret))
}

/** The user id in a valid, unexpired notice, or null for anything else. */
export async function readSuspensionNotice(token: string, secret: string): Promise<string | null> {
  if (!token || !secret) return null
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
    })
    return typeof payload.userId === 'string' && payload.userId ? payload.userId : null
  } catch {
    return null
  }
}
