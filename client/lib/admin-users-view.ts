/**
 * Pure view logic for the admin users table. This is UI display only: the server
 * decides what is actually allowed.
 *
 * The client and server share no code, so the types below mirror the server's GraphQL
 * SDL (`AdminUser`, `AdminUserSortKey` in server/src/schema.ts) by hand.
 */
import type { Role } from './admin-access'

export const USER_SORT_KEYS = [
  'role',
  'username',
  'crews',
  'status',
  'entries',
  'battlesWon',
  'votesCast',
  'votesReceived',
  'ideasPosted',
  'createdAt',
  'lastSignInAt',
  'email',
] as const

export type UserSortKey = (typeof USER_SORT_KEYS)[number]

/** Mirrors the `AdminUser` GraphQL type. Dates are ISO strings. */
export interface AdminUserRow {
  id: string
  username: string | null
  name: string | null
  image: string | null
  email: string
  role: Role
  status: 'ACTIVE' | 'SUSPENDED'
  suspendedUntil: string | null
  suspensionReason: string | null
  crews: string[]
  entries: number
  battlesWon: number
  votesCast: number
  votesReceived: number
  ideasPosted: number
  createdAt: string
  lastSignInAt: string
}

export type RowAction = 'edit' | 'suspend' | 'reinstate' | 'delete' | 'makeAdmin' | 'removeAdmin'

export function rowActions(
  viewer: Role,
  target: { role: Role; status: 'ACTIVE' | 'SUSPENDED' },
): RowAction[] {
  if (viewer !== 'ADMIN' && viewer !== 'OWNER') return []
  const canActOn =
    target.role === 'USER' || (viewer === 'OWNER' && target.role === 'ADMIN')
  if (!canActOn) return []

  const actions: RowAction[] = [
    'edit',
    target.status === 'SUSPENDED' ? 'reinstate' : 'suspend',
    'delete',
  ]
  if (viewer === 'OWNER') {
    actions.push(target.role === 'USER' ? 'makeAdmin' : 'removeAdmin')
  }
  return actions
}

export function rowNote(viewer: Role, target: { role: Role }): 'Owner only' | 'Protected' | null {
  if (target.role === 'OWNER') return 'Protected'
  if (target.role === 'ADMIN' && viewer !== 'OWNER') return 'Owner only'
  return null
}

/** What a row note means, for hover text and screen readers (the note itself is only two words). */
export function rowNoteExplanation(note: 'Owner only' | 'Protected'): string {
  return note === 'Owner only' ? 'Only the owner can change admins' : "The owner account can't be changed here"
}

export type SortState = { key: UserSortKey; dir: 'ASC' | 'DESC' }

export const DEFAULT_SORT: SortState = { key: 'createdAt', dir: 'DESC' }

export function nextSort(current: SortState, key: UserSortKey): SortState {
  if (current.key === key) {
    return { key, dir: current.dir === 'ASC' ? 'DESC' : 'ASC' }
  }
  return { key, dir: 'ASC' }
}

const DASH = '—'

const joinedFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatJoined(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return DASH
  return joinedFormat.format(date)
}

export function formatLastSignIn(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return DASH

  const minutes = Math.floor((now.getTime() - then) / 60_000)
  if (minutes < 1) return 'just now' // includes timestamps in the future (clock skew)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatJoined(iso)
}

export function crewsCell(crews: string[]): { first: string | null; more: number } {
  return { first: crews[0] ?? null, more: Math.max(0, crews.length - 1) }
}
