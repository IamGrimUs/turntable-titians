import { GraphQLError } from 'graphql'

/**
 * Input rules for user-supplied text, links and dates. Pure functions that throw
 * a BAD_USER_INPUT GraphQLError with a message that is safe, and helpful, to show
 * directly to the user (the web forms display it as-is).
 *
 * The client form limits (maxLength attributes) should mirror LIMITS.
 */

export const LIMITS = {
  title: 100,
  battleType: 40,
  description: 1000,
  usernameMin: 3,
  usernameMax: 30,
  crewName: 40,
  maxCrews: 10,
  url: 500,
  maxBattleDays: 366,
  suspensionReason: 500,
  displayName: 60,
} as const

export function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } })
}

// Control characters (including NUL, which Postgres refuses to store) are never valid in one-line text.
const SINGLE_LINE_FORBIDDEN = /[\u0000-\u001F\u007F]/
// Multi-line text may contain tab, newline and carriage return, but no other control characters.
const MULTI_LINE_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

export function cleanSingleLine(
  value: unknown,
  field: string,
  opts: { max: number; required?: boolean }
): string | undefined {
  if (value === undefined || value === null) {
    if (opts.required) throw badInput(`${field} is required.`)
    return undefined
  }
  if (typeof value !== 'string') throw badInput(`${field} must be text.`)
  const trimmed = value.trim()
  if (trimmed === '') {
    if (opts.required) throw badInput(`${field} is required.`)
    return undefined
  }
  if (SINGLE_LINE_FORBIDDEN.test(trimmed)) throw badInput(`${field} contains characters that aren't allowed.`)
  if (trimmed.length > opts.max) throw badInput(`${field} must be ${opts.max} characters or fewer.`)
  return trimmed
}

export function cleanMultiLine(value: unknown, field: string, opts: { max: number }): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw badInput(`${field} must be text.`)
  const normalised = value.replace(/\r\n?/g, '\n').trim()
  if (normalised === '') return undefined
  if (MULTI_LINE_FORBIDDEN.test(normalised)) throw badInput(`${field} contains characters that aren't allowed.`)
  if (normalised.length > opts.max) throw badInput(`${field} must be ${opts.max} characters or fewer.`)
  return normalised
}

function hostAllowed(hostname: string, allowedHosts: string[]): boolean {
  return allowedHosts.some((entry) =>
    entry.startsWith('*.') ? hostname.endsWith(entry.slice(1)) : hostname === entry
  )
}

/**
 * Accepts only well-formed https links. This blocks javascript:, data:, file: and
 * similar schemes, and links with embedded credentials. Optionally restricts the
 * host to an allowlist of exact hosts or "*.suffix" wildcards.
 */
export function cleanHttpsUrl(
  value: unknown,
  field: string,
  opts: { max: number; allowedHosts?: string[] }
): string {
  if (typeof value !== 'string' || value.trim() === '') throw badInput(`${field} is required.`)
  const trimmed = value.trim()
  if (trimmed.length > opts.max) throw badInput(`${field} must be ${opts.max} characters or fewer.`)
  // URL parsing silently strips tabs and newlines, so reject them up front.
  if (SINGLE_LINE_FORBIDDEN.test(trimmed)) throw badInput(`${field} must be a valid link.`)

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw badInput(`${field} must be a valid link.`)
  }
  if (url.protocol !== 'https:') throw badInput(`${field} must be a link that starts with https://`)
  if (url.username || url.password) throw badInput(`${field} must not contain a username or password.`)
  if (!url.hostname.includes('.')) throw badInput(`${field} must be a valid link.`)
  if (opts.allowedHosts && !hostAllowed(url.hostname.toLowerCase(), opts.allowedHosts)) {
    throw badInput(`${field} must be hosted on an allowed site.`)
  }
  return trimmed
}

/**
 * Optional restriction on where profile images may be hosted, from the
 * ALLOWED_IMAGE_HOSTS setting (comma separated, e.g.
 * "cdn.example.com,*.googleusercontent.com"). Unset means any https host.
 */
export function getAllowedImageHosts(
  env: Record<string, string | undefined> = process.env
): string[] | undefined {
  const hosts = (env.ALLOWED_IMAGE_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return hosts.length > 0 ? hosts : undefined
}

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]+$/
// Compared after lower-casing and removing . _ - so "Ad_min" cannot slip past "admin".
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'support',
  'staff',
  'moderator',
  'mod',
  'official',
  'battleskratch',
  'turntabletitans',
])

export function cleanUsername(value: unknown): string {
  const message = `Usernames must be ${LIMITS.usernameMin}-${LIMITS.usernameMax} characters and can only use letters, numbers, dots, underscores and hyphens.`
  if (typeof value !== 'string') throw badInput(message)
  const username = value.trim()
  if (
    username.length < LIMITS.usernameMin ||
    username.length > LIMITS.usernameMax ||
    !USERNAME_PATTERN.test(username)
  ) {
    throw badInput(message)
  }
  if (RESERVED_USERNAMES.has(username.toLowerCase().replace(/[._-]/g, ''))) {
    throw badInput('That username is not available.')
  }
  return username
}

export function cleanCrews(value: unknown): string[] {
  if (!Array.isArray(value)) throw badInput('Crews must be a list.')
  const seen = new Set<string>()
  const crews: string[] = []
  for (const item of value) {
    const crew = cleanSingleLine(item, 'Crew name', { max: LIMITS.crewName })
    if (crew === undefined) continue
    const key = crew.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    crews.push(crew)
  }
  if (crews.length > LIMITS.maxCrews) throw badInput(`You can list up to ${LIMITS.maxCrews} crews.`)
  return crews
}

export function parseBattleDates(startDate: unknown, endDate: unknown): { start: Date; end: Date } {
  const parse = (v: unknown) => (typeof v === 'string' ? new Date(v) : new Date(NaN))
  const start = parse(startDate)
  const end = parse(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw badInput('Start date and end date must be valid dates.')
  }
  if (end.getTime() < start.getTime()) throw badInput('The end date must be on or after the start date.')
  const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
  if (days > LIMITS.maxBattleDays) {
    throw badInput(`A battle can last at most ${LIMITS.maxBattleDays} days.`)
  }
  return { start, end }
}
