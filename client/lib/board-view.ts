/**
 * Pure view logic for the suggestions board. UI display only: the server decides what is
 * actually allowed.
 *
 * The client and server share no code, so the limits, enum values and row types below
 * mirror server/src/boardRules.ts (`BOARD_LIMITS`) and server/src/schema.ts (`Idea`,
 * `IdeaComment`, `IdeaCategory`, `IdeaTopic`, `IdeaStatus`) by hand. Keep them in step.
 */

/** Mirrors the client-relevant values of `BOARD_LIMITS` in server/src/boardRules.ts. */
export const BOARD_LIMITS = {
  ideaTitle: 100,
  ideaBody: 1000,
  commentBody: 500,
} as const

export const IDEA_CATEGORIES = ['BUG', 'SUGGESTION', 'OTHER'] as const
export const IDEA_TOPICS = ['BATTLES', 'VOTING', 'PROFILES', 'LOGIN_ACCOUNT', 'SITE_WIDE'] as const
export const IDEA_STATUSES = ['OPEN', 'PLANNED', 'IN_PROGRESS', 'DONE', 'DECLINED'] as const

export type IdeaCategory = (typeof IDEA_CATEGORIES)[number]
export type IdeaTopic = (typeof IDEA_TOPICS)[number]
export type IdeaStatus = (typeof IDEA_STATUSES)[number]

const CATEGORY_LABELS: Record<IdeaCategory, string> = {
  BUG: 'Bug',
  SUGGESTION: 'Suggestion',
  OTHER: 'Other',
}

const TOPIC_LABELS: Record<IdeaTopic, string> = {
  BATTLES: 'Battles',
  VOTING: 'Voting',
  PROFILES: 'Profiles',
  LOGIN_ACCOUNT: 'Login & account',
  SITE_WIDE: 'Site-wide',
}

const STATUS_LABELS: Record<IdeaStatus, string> = {
  OPEN: 'Open',
  PLANNED: 'Planned',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  DECLINED: 'Declined',
}

function label(labels: Record<string, string>, value: string): string {
  return Object.prototype.hasOwnProperty.call(labels, value) ? labels[value] : value
}

/** Unknown values are returned as sent, so a newer server value still shows something. */
export const categoryLabel = (value: string): string => label(CATEGORY_LABELS, value)
export const topicLabel = (value: string): string => label(TOPIC_LABELS, value)
export const statusLabel = (value: string): string => label(STATUS_LABELS, value)

export type StatusTone = 'good' | 'warn' | 'danger' | 'neutral'

export function statusTone(status: IdeaStatus): StatusTone {
  switch (status) {
    case 'DONE':
      return 'good'
    case 'PLANNED':
    case 'IN_PROGRESS':
      return 'warn'
    case 'DECLINED':
      return 'danger'
    default:
      return 'neutral'
  }
}

/** Filter tabs above the list; `null` means no category filter. */
export const CATEGORY_TABS: Array<{ value: IdeaCategory | null; label: string }> = [
  { value: null, label: 'All' },
  { value: 'SUGGESTION', label: 'Suggestions' },
  { value: 'BUG', label: 'Bugs' },
  { value: 'OTHER', label: 'Other' },
]

/** The public author shape (`User` in the SDL); never an email. */
export interface BoardAuthor {
  id: string
  username: string | null
  name: string | null
  image: string | null
}

/** Name shown for an author: username, then display name, then a neutral fallback. */
export function authorDisplayName(author: Pick<BoardAuthor, 'username' | 'name'>): string {
  return author.username ?? author.name ?? 'DJ'
}

/** Mirrors the `IdeaComment` GraphQL type. Dates are ISO strings. */
export interface CommentRow {
  id: string
  ideaId: string
  body: string
  hidden: boolean
  author: BoardAuthor
  voteCount: number
  viewerHasVoted: boolean
  createdAt: string
}

/**
 * Mirrors the `Idea` GraphQL type. `comments` is only selected by the detail query, not
 * the list query (which selects `commentCount` instead).
 */
export interface IdeaRow {
  id: string
  title: string
  body: string
  category: IdeaCategory
  topic: IdeaTopic | null
  status: IdeaStatus
  hidden: boolean
  author: BoardAuthor
  voteCount: number
  commentCount: number
  viewerHasVoted: boolean
  comments?: CommentRow[]
  createdAt: string
}

export type BoardAccess = 'ANONYMOUS' | 'NEEDS_USERNAME' | 'READY'

/** What the viewer may do on the board: read only, finish onboarding first, or take part. */
export function boardAccess(user: { id?: string; username?: string | null } | null | undefined): BoardAccess {
  if (!user?.id) return 'ANONYMOUS'
  return user.username ? 'READY' : 'NEEDS_USERNAME'
}
