/**
 * Pure logic behind the admin user dialogs (edit, suspend, delete, role). UI display and
 * input shaping only: the server validates everything again and decides what is allowed.
 *
 * The limits mirror `LIMITS` in server/src/validation.ts (the two packages share no code).
 */
import type { AdminUserRow } from './admin-users-view'

export const DIALOG_LIMITS = {
  username: 30,
  displayName: 60,
  suspensionReason: 500,
  crewName: 40,
  maxCrews: 10,
} as const

export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'

// Error codes whose server messages are written to be shown to users as-is.
const USER_SAFE_CODES = new Set(['BAD_USER_INPUT', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED', 'UNAUTHENTICATED'])

/**
 * The message to show for a failed admin mutation: the server's own message for deliberate
 * (user-safe) errors, a generic one for anything else, network failures included.
 */
export function adminErrorMessage(error: unknown): string {
  const graphQLErrors = (error as { graphQLErrors?: readonly unknown[] } | null | undefined)?.graphQLErrors
  if (Array.isArray(graphQLErrors)) {
    for (const item of graphQLErrors) {
      const e = item as { message?: unknown; extensions?: { code?: unknown } } | null
      const code = e?.extensions?.code
      if (typeof code === 'string' && USER_SAFE_CODES.has(code) && typeof e?.message === 'string' && e.message) {
        return e.message
      }
    }
  }
  return GENERIC_ERROR_MESSAGE
}

/**
 * True when the table behind a dialog may be out of date after this failure and should be
 * reloaded: the user was already deleted or changed by someone else (NOT_FOUND, FORBIDDEN),
 * or, for a delete, the request failed on the network and may have gone through anyway.
 * A rejected form (BAD_USER_INPUT) never reloads: the admin is still fixing it.
 */
export function shouldRefreshAfterFailure(error: unknown, isDelete: boolean): boolean {
  const e = error as { graphQLErrors?: readonly unknown[] } | null | undefined
  const graphQLErrors = Array.isArray(e?.graphQLErrors) ? e.graphQLErrors : []
  for (const item of graphQLErrors) {
    const code = (item as { extensions?: { code?: unknown } } | null)?.extensions?.code
    if (code === 'NOT_FOUND' || code === 'FORBIDDEN') return true
  }
  return isDelete && graphQLErrors.length === 0
}

/** Who a dialog talks about: the username, else the email (an account with no username yet). */
export function userLabel(row: Pick<AdminUserRow, 'username' | 'email'>): string {
  return row.username ?? row.email
}

// ---------------------------------------------------------------- delete confirmation

/** What the admin must type to enable Delete: the username, or the email when there is none. */
export function deleteConfirmTarget(row: Pick<AdminUserRow, 'username' | 'email'>): string {
  return userLabel(row)
}

/**
 * True when the typed text matches exactly (after trimming). Usernames are compared
 * case-sensitively. An email is compared ignoring case, because email addresses are.
 */
export function deleteConfirmMatches(typed: string, row: Pick<AdminUserRow, 'username' | 'email'>): boolean {
  const value = typed.trim()
  if (value === '') return false
  if (row.username !== null) return value === row.username
  return value.toLowerCase() === row.email.toLowerCase()
}

// ---------------------------------------------------------------- suspend

/** Text typed into the reason box: one line, so line breaks become spaces (the server rejects them). */
export function flattenReason(value: string): string {
  return value.replace(/[\r\n]+/g, ' ')
}

export function validateSuspendReason(reason: string): string | null {
  const trimmed = reason.trim()
  if (trimmed === '') return 'Enter a reason for the suspension.'
  if (trimmed.length > DIALOG_LIMITS.suspensionReason) {
    return `The reason must be ${DIALOG_LIMITS.suspensionReason} characters or fewer.`
  }
  return null
}

export type SuspendUntil = { ok: true; until: string | null } | { ok: false; error: string }

/**
 * Converts the value of a `datetime-local` input (the viewer's local time, no zone) into the
 * ISO string the API takes. Blank means "until reinstated". A date that is unparseable or
 * already past is refused here; the server checks the date again.
 */
export function suspendUntilToIso(value: string, now: Date = new Date()): SuspendUntil {
  const trimmed = value.trim()
  if (trimmed === '') return { ok: true, until: null }
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return { ok: false, error: 'Enter a valid end date.' }
  if (date.getTime() <= now.getTime()) return { ok: false, error: 'The end date must be in the future.' }
  return { ok: true, until: date.toISOString() }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** A Date as a `datetime-local` value (local time), e.g. for the input's `min`. */
export function toDateTimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** An ISO instant in the viewer's local time, e.g. "Nov 20, 2026, 3:30 PM". */
export function formatLocalDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

// ---------------------------------------------------------------- edit

export interface EditForm {
  username: string
  name: string
  crews: string[]
  removeAvatar: boolean
}

/** The mutation arguments for an edit. Only fields that changed are present. */
export interface UpdateInput {
  username?: string
  name?: string
  externalCrews?: string[]
  removeAvatar?: boolean
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

/**
 * Builds the `adminUpdateUser` input from the form, sending only what changed: on the server
 * a missing (null) argument means "no change", `name: ''` clears the display name, and an
 * unchanged username or crew list is simply left out. Returns null when nothing changed.
 *
 * `currentCrews` is the user's own (external) crew list, or null when it could not be loaded;
 * crews are then never sent, so the user's list can not be overwritten by accident.
 */
export function buildUpdateInput(
  row: Pick<AdminUserRow, 'username' | 'name' | 'image'>,
  currentCrews: string[] | null,
  form: EditForm,
): UpdateInput | null {
  const input: UpdateInput = {}

  const username = form.username.trim()
  if (username !== (row.username ?? '')) input.username = username

  const name = form.name.trim()
  if (name !== (row.name ?? '')) input.name = name

  if (currentCrews !== null && !sameList(form.crews, currentCrews)) input.externalCrews = form.crews

  if (form.removeAvatar && row.image) input.removeAvatar = true

  return Object.keys(input).length > 0 ? input : null
}

export type AddCrewResult = { ok: true; crews: string[] } | { ok: false; error: string }

/** Adds a crew to the list: trimmed, no case-insensitive duplicates, at most 10. */
export function addCrew(crews: string[], input: string): AddCrewResult {
  const crew = input.trim()
  if (crew === '') return { ok: true, crews }
  if (crew.length > DIALOG_LIMITS.crewName) {
    return { ok: false, error: `A crew name must be ${DIALOG_LIMITS.crewName} characters or fewer.` }
  }
  if (crews.some((c) => c.toLowerCase() === crew.toLowerCase())) return { ok: true, crews }
  if (crews.length >= DIALOG_LIMITS.maxCrews) {
    return { ok: false, error: `You can list up to ${DIALOG_LIMITS.maxCrews} crews.` }
  }
  return { ok: true, crews: [...crews, crew] }
}

/** Crews the user belongs to through the app (not editable here): the row's crews minus their own list. */
export function internalCrewNames(allCrews: string[], externalCrews: string[]): string[] {
  const external = new Set(externalCrews.map((c) => c.toLowerCase()))
  return allCrews.filter((c) => !external.has(c.toLowerCase()))
}
