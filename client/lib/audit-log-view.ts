/**
 * Display rules for the admin audit log. Pure functions, no React.
 *
 * The server writes `details` as JSON text whose shape depends on the action (see
 * server/src/adminResolvers.ts). It is untrusted display data: it is parsed defensively and
 * summarised in a short sentence. An unknown or broken shape gives an empty summary, never raw JSON.
 */

export interface AuditLogRow {
  id: string
  createdAt: string
  actorId: string
  actorUsername: string | null
  actorEmail: string
  action: string
  targetType: string
  targetId: string
  targetUsername: string | null
  targetEmail: string | null
  details: string
}

export type ActionTone = 'danger' | 'warn' | 'good' | 'neutral'

const ACTION_LABELS: Record<string, string> = {
  USER_EDIT: 'Edited user',
  USER_SUSPEND: 'Suspended user',
  USER_REINSTATE: 'Reinstated user',
  USER_DELETE: 'Deleted user',
  EMAIL_BLOCK: 'Blocked email',
  ROLE_GRANT: 'Made admin',
  ROLE_REVOKE: 'Removed admin',
}

const ACTION_TONES: Record<string, ActionTone> = {
  USER_EDIT: 'neutral',
  USER_SUSPEND: 'warn',
  USER_REINSTATE: 'good',
  USER_DELETE: 'danger',
  EMAIL_BLOCK: 'danger',
  ROLE_GRANT: 'good',
  ROLE_REVOKE: 'warn',
}

// Field names the edit action reports, in the words an admin would use.
const FIELD_LABELS: Record<string, string> = {
  username: 'username',
  name: 'name',
  externalCrews: 'crews',
  image: 'avatar',
}

export const MAX_VALUE_LENGTH = 40
export const MAX_REASON_LENGTH = 120
export const MAX_SUMMARY_LENGTH = 240
const NONE = 'none'
const ARROW = '→'

/** A readable label for an action; an action this client does not know is shown as sent. */
export function actionLabel(action: string): string {
  return Object.prototype.hasOwnProperty.call(ACTION_LABELS, action) ? ACTION_LABELS[action] : action
}

export function actionTone(action: string): ActionTone {
  return Object.prototype.hasOwnProperty.call(ACTION_TONES, action) ? ACTION_TONES[action] : 'neutral'
}

/** Username when there is one (the snapshot may be null), else the email, else a dash. */
export function partyLabel(username: string | null | undefined, email: string | null | undefined): string {
  const name = typeof username === 'string' ? username.trim() : ''
  if (name) return name
  const mail = typeof email === 'string' ? email.trim() : ''
  return mail || '—'
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

/** The details JSON as a plain object, or null when it is malformed or not an object. */
export function parseDetails(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  try {
    const value: unknown = JSON.parse(raw)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return NONE
  if (typeof value === 'string') return value.trim() === '' ? NONE : truncate(value, MAX_VALUE_LENGTH)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const items = value.filter((v) => typeof v === 'string' || typeof v === 'number').map(String)
    return items.length === 0 ? NONE : truncate(items.join(', '), MAX_VALUE_LENGTH)
  }
  return '?'
}

/** A date for display, in the viewer's time zone unless one is given (tests pass UTC). */
export function formatAuditTime(iso: string, timeZone?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(date)
}

function formatUntil(value: unknown, timeZone?: string): string {
  if (typeof value !== 'string') return 'no end date'
  const text = formatAuditTime(value, timeZone)
  return text === '—' ? 'no end date' : text
}

function summarizeEdit(details: Record<string, unknown>): string {
  const changes = details.changes
  if (!isRecord(changes)) return ''
  const parts: string[] = []
  for (const [key, change] of Object.entries(changes)) {
    if (!isRecord(change)) continue
    const label = FIELD_LABELS[key] ?? truncate(key, 20)
    if (key === 'image') {
      // Only ever cleared from the admin tools; never print an image address.
      parts.push(change.to === null ? 'avatar: removed' : 'avatar: changed')
      continue
    }
    parts.push(`${label}: ${formatValue(change.from)} ${ARROW} ${formatValue(change.to)}`)
  }
  return parts.join('; ')
}

function summarizeSuspend(details: Record<string, unknown>, timeZone?: string): string {
  const reason = typeof details.reason === 'string' && details.reason.trim() ? truncate(details.reason, MAX_REASON_LENGTH) : null
  if (!reason && !('until' in details)) return ''
  return `Reason: ${reason ?? NONE}. Until: ${formatUntil(details.until, timeZone)}`
}

function summarizeReinstate(details: Record<string, unknown>, timeZone?: string): string {
  const hasReason = typeof details.previousReason === 'string' && details.previousReason.trim() !== ''
  const hasUntil = typeof details.previousUntil === 'string'
  if (!hasReason && !('previousUntil' in details) && !('previousReason' in details)) return ''
  const reason = hasReason ? truncate(details.previousReason as string, MAX_REASON_LENGTH) : NONE
  const until = hasUntil ? formatUntil(details.previousUntil, timeZone) : 'no end date'
  return `Was suspended. Reason: ${reason}. Until: ${until}`
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
}

function summarizeDelete(details: Record<string, unknown>): string {
  const entries = count(details.entries)
  const cast = count(details.votesCast)
  const received = count(details.votesReceived)
  const parts: string[] = []
  if (entries !== null) parts.push(`${entries} ${entries === 1 ? 'entry' : 'entries'}`)
  if (cast !== null) parts.push(`${cast} ${cast === 1 ? 'vote' : 'votes'} cast`)
  if (received !== null) parts.push(`${received} ${received === 1 ? 'vote' : 'votes'} received`)
  const removed = parts.length > 0 ? `Removed ${parts.join(', ')}` : ''
  const blocked = details.emailBlocked === true ? 'Email blocked' : ''
  return [removed, blocked].filter(Boolean).join('. ')
}

function summarizeRole(details: Record<string, unknown>): string {
  if (typeof details.from !== 'string' || typeof details.to !== 'string') return ''
  return `${truncate(details.from, 20)} ${ARROW} ${truncate(details.to, 20)}`
}

/** One short line describing what changed, or '' when there is nothing safe and useful to show. */
export function summarizeDetails(action: string, raw: unknown, timeZone?: string): string {
  const details = parseDetails(raw)
  let summary = ''
  if (action === 'EMAIL_BLOCK') {
    summary = 'Email can no longer sign in'
  } else if (details) {
    switch (action) {
      case 'USER_EDIT':
        summary = summarizeEdit(details)
        break
      case 'USER_SUSPEND':
        summary = summarizeSuspend(details, timeZone)
        break
      case 'USER_REINSTATE':
        summary = summarizeReinstate(details, timeZone)
        break
      case 'USER_DELETE':
        summary = summarizeDelete(details)
        break
      case 'ROLE_GRANT':
      case 'ROLE_REVOKE':
        summary = summarizeRole(details)
        break
    }
  }
  return truncate(summary, MAX_SUMMARY_LENGTH)
}
