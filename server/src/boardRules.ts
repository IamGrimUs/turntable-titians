import { IdeaCategory, IdeaTopic } from '@prisma/client'
import { badInput, cleanMultiLine, cleanSingleLine } from './validation'

/**
 * Input rules for the suggestions board (ideas and comments). Pure functions that
 * throw a BAD_USER_INPUT GraphQLError with a message that is safe to show users.
 *
 * The client form limits (maxLength attributes) should mirror BOARD_LIMITS.
 */

export const BOARD_LIMITS = {
  ideaTitle: 100,
  ideaBody: 1000,
  commentBody: 500,
  ideasPerDay: 5,
  commentsPerDay: 50,
} as const

const DAY_MS = 24 * 60 * 60 * 1000

// Links are not allowed anywhere on the board (spam and phishing), so a plain
// case-insensitive check for a scheme or a "www." prefix is enough.
const LINK_PATTERN = /https?:\/\/|www\./i

export function containsLink(text: string): boolean {
  return LINK_PATTERN.test(text)
}

function rejectLinks(text: string, field: string): void {
  if (containsLink(text)) throw badInput(`${field} can't contain links.`)
}

function cleanRequiredMultiLine(value: unknown, field: string, max: number): string {
  const text = cleanMultiLine(value, field, { max })
  if (text === undefined) throw badInput(`${field} is required.`)
  rejectLinks(text, field)
  return text
}

function cleanEnum<T extends string>(value: unknown, allowed: readonly T[], message: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw badInput(message)
  return value as T
}

export function cleanIdeaInput(input: { title: unknown; body: unknown; category: unknown; topic?: unknown }): {
  title: string
  body: string
  category: IdeaCategory
  topic: IdeaTopic | null
} {
  const title = cleanSingleLine(input.title, 'Title', { max: BOARD_LIMITS.ideaTitle, required: true }) as string
  rejectLinks(title, 'Title')
  const body = cleanRequiredMultiLine(input.body, 'Description', BOARD_LIMITS.ideaBody)
  const category = cleanEnum(input.category, Object.values(IdeaCategory), 'Choose a valid category.')
  const topic =
    input.topic === undefined || input.topic === null
      ? null
      : cleanEnum(input.topic, Object.values(IdeaTopic), 'Choose a valid topic.')
  return { title, body, category, topic }
}

export function cleanCommentBody(value: unknown): string {
  return cleanRequiredMultiLine(value, 'Comment', BOARD_LIMITS.commentBody)
}

/** One-line preview of some text: whitespace collapsed, cut to `max` characters with a trailing "…". */
export function excerpt(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return flat.slice(0, max - 1).trimEnd() + '…'
}

/** The moment 24 hours before `now`, the start of the rolling window for the daily posting limits. */
export function dayAgo(now: Date = new Date()): Date {
  return new Date(now.getTime() - DAY_MS)
}
