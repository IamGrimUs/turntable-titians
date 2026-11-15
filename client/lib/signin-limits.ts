import { consume, hashKey, peek, type RateLimitDb } from './rate-limit'

/** How many sign-in emails one address, and one network address, can request per window. */
export const SIGNIN_LIMITS = {
  email: { limit: 3, windowSeconds: 60 * 60 },
  ip: { limit: 10, windowSeconds: 60 * 60 },
} as const

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number
  constructor(retryAfterSeconds: number) {
    super(rateLimitMessage(retryAfterSeconds))
    this.name = 'RateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function rateLimitMessage(retryAfterSeconds: number): string {
  const minutes = Math.ceil(retryAfterSeconds / 60)
  let wait: string
  if (retryAfterSeconds < 60) wait = 'less than a minute'
  else if (minutes >= 60) wait = 'about an hour'
  else wait = minutes === 1 ? '1 minute' : `${minutes} minutes`
  return `Too many sign-in emails have been requested. Please try again in ${wait}.`
}

/**
 * Auth.js wraps whatever a provider throws, so look through the wrapping
 * for our RateLimitError.
 */
export function findRateLimitError(error: unknown): RateLimitError | null {
  let current: unknown = error
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    if ((current as { name?: string }).name === 'RateLimitError') return current as RateLimitError
    const cause = (current as { cause?: unknown }).cause
    current = cause && typeof cause === 'object' && 'err' in cause ? (cause as { err: unknown }).err : cause
  }
  return null
}

/**
 * One inbox can be reached through many spellings: alice+1@x.com, alice+2@x.com,
 * and (on Gmail) a.lice@gmail.com. Reduce them to one so they share a single limit.
 */
export function normalizeEmailForLimit(email: string): string {
  const lower = email.trim().toLowerCase()
  const at = lower.lastIndexOf('@')
  if (at < 1) return lower
  let local = lower.slice(0, at)
  let domain = lower.slice(at + 1)
  const withoutTag = local.split('+')[0]
  if (withoutTag) local = withoutTag
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '')
    domain = 'gmail.com'
  }
  return `${local}@${domain}`
}

/** The caller's address as reported by the hosting platform's proxy, if any. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip')?.trim() || null
}

export type SignInVerdict =
  | { allowed: true }
  | { allowed: false; reason: 'ip' | 'email'; retryAfterSeconds: number }

/**
 * Decides whether a sign-in email may be sent.
 *  - 'consume' counts the attempt (use where the email is actually sent)
 *  - 'peek' only looks (use to show a friendly message early, without counting twice)
 *
 * The network address is checked first, and a blocked address does not spend the
 * email's allowance. If the limiter itself fails (database down, table missing),
 * it fails OPEN, because a limiter bug must never stop people from signing in.
 */
export async function checkSignIn(
  db: RateLimitDb,
  input: { email: string; ip: string | null; mode: 'consume' | 'peek' },
  opts: { secret?: string } = {}
): Promise<SignInVerdict> {
  const secret = opts.secret ?? process.env.AUTH_SECRET ?? ''
  const run = input.mode === 'consume' ? consume : peek
  try {
    if (input.ip) {
      const ip = await run(db, { key: hashKey('signin-ip', input.ip, secret), ...SIGNIN_LIMITS.ip })
      if (!ip.allowed) return { allowed: false, reason: 'ip', retryAfterSeconds: ip.retryAfterSeconds }
    }
    const email = await run(db, {
      key: hashKey('signin-email', normalizeEmailForLimit(input.email), secret),
      ...SIGNIN_LIMITS.email,
    })
    if (!email.allowed) return { allowed: false, reason: 'email', retryAfterSeconds: email.retryAfterSeconds }
    return { allowed: true }
  } catch (err) {
    console.error('[rate limit] sign-in limit check failed; allowing the request', err)
    return { allowed: true }
  }
}
