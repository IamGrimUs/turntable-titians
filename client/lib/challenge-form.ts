import { CHALLENGE_LIMITS, type ChallengeFormValues } from './challenge-view'

/**
 * Pure helpers for the challenge form (`/challenges/new`). UI convenience only: the server
 * re-checks every rule and its message is what the person sees when it refuses.
 */

const GENERIC_ERROR = 'Something went wrong. Please try again.'

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g

/** Default voting length; one of `CHALLENGE_LIMITS.votingDays`. */
const DEFAULT_VOTING_DAYS = 7

/**
 * The DJ name from `?to=`. Takes the first value when repeated, drops control characters and a
 * leading "@", and caps the length. The result only ever lands in an input's value.
 */
export function prefillUsername(to: string | string[] | undefined | null): string {
  const raw = Array.isArray(to) ? to[0] : to
  if (!raw) return ''
  return raw
    .replace(CONTROL_CHARACTERS, '')
    .trim()
    .replace(/^@/, '')
    .trim()
    .slice(0, CHALLENGE_LIMITS.usernameMax)
}

export function initialChallengeValues(username: string): ChallengeFormValues {
  return { username, title: '', message: '', videoUrl: '', votingDays: DEFAULT_VOTING_DAYS }
}

export interface CreateChallengeVariables {
  opponentUsername: string
  title: string
  message: string | null
  videoUrl: string
  votingDays: number
}

/** The mutation arguments: trimmed, a blank message sent as null. No other field is ever sent. */
export function buildChallengeVariables(v: ChallengeFormValues): CreateChallengeVariables {
  const message = v.message.trim()
  return {
    opponentUsername: v.username.trim(),
    title: v.title.trim(),
    message: message === '' ? null : message,
    videoUrl: v.videoUrl.trim(),
    votingDays: v.votingDays,
  }
}

/** Field order on the form, for focusing the first invalid one. */
export const CHALLENGE_FIELD_ORDER = ['username', 'title', 'message', 'videoUrl', 'votingDays'] as const
export type ChallengeField = (typeof CHALLENGE_FIELD_ORDER)[number]

export function firstErrorField(errors: Record<string, string>): ChallengeField | null {
  return CHALLENGE_FIELD_ORDER.find((field) => errors[field]) ?? null
}

// Codes whose messages the server wrote for people. Everything else (INTERNAL_SERVER_ERROR, a
// missing code, a network failure) gets the generic message.
const SAFE_CODES = new Set(['BAD_USER_INPUT', 'NOT_FOUND', 'RATE_LIMITED', 'UNAUTHENTICATED', 'FORBIDDEN'])

/** The message to show for a failed `createChallenge`: the server's own, only for deliberate errors. */
export function challengeErrorMessage(error: unknown): string {
  const list = (error as { graphQLErrors?: readonly unknown[] } | null | undefined)?.graphQLErrors
  if (!Array.isArray(list)) return GENERIC_ERROR
  for (const item of list) {
    const e = item as { message?: unknown; extensions?: { code?: unknown } } | null
    const code = e?.extensions?.code
    if (typeof code === 'string' && SAFE_CODES.has(code) && typeof e?.message === 'string' && e.message.trim() !== '') {
      return e.message
    }
  }
  return GENERIC_ERROR
}

// The server refusals about the DJ field. Anything not listed shows as a form message, so a
// reworded server message never goes missing, it just shows lower down.
const USERNAME_ERRORS = new Set([
  'No DJ with that username.',
  "You can't challenge yourself.",
  "That DJ can't be challenged right now.",
])

export function serverErrorField(message: string): 'username' | null {
  return USERNAME_ERRORS.has(message) ? 'username' : null
}

/** Where to go after sending: the challenge's own screen. */
export function challengePath(id: string): string {
  return `/challenges/${encodeURIComponent(id)}`
}

/** The id of the element a field puts focus on (the input, or the group for the voting length). */
export function fieldDomId(field: ChallengeField): string {
  return `challenge-${field}`
}

/**
 * How long the form waits for the route change after a successful send before it shows a plain
 * link to the new challenge, so it never stays on "Sending…" with nothing else to do.
 */
export const SENT_FALLBACK_DELAY_MS = 5000
