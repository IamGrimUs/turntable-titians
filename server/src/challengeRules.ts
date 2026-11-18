import type { ChallengeStatus } from '@prisma/client'
import { containsLink } from './boardRules'
import { badInput, cleanHttpsUrl, cleanMultiLine, cleanSingleLine, LIMITS } from './validation'

/**
 * Pure rules for direct challenges (one DJ challenges another to a head-to-head duel).
 * No database access: resolvers call these before and after their own reads.
 *
 * The client form limits mirror CHALLENGE_LIMITS by hand.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export const CHALLENGE_LIMITS = {
  titleMax: LIMITS.title,
  messageMax: 280,
  answerDays: 10,
  votingDays: [3, 7, 14],
  pendingOutgoing: 3,
  perDay: 5,
  declineCooldownDays: 7,
} as const

/** EXPIRED is computed, never stored. */
export type EffectiveChallengeStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'EXPIRED'

export function effectiveStatus(
  c: { status: ChallengeStatus; expiresAt: Date },
  now: Date = new Date()
): EffectiveChallengeStatus {
  if (c.status === 'PENDING' && c.expiresAt.getTime() <= now.getTime()) return 'EXPIRED'
  return c.status
}

export function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + CHALLENGE_LIMITS.answerDays * DAY_MS)
}

export function cleanChallengeInput(i: {
  opponentUsername: unknown
  title: unknown
  message?: unknown
  videoUrl: unknown
  votingDays: unknown
}): { opponentUsername: string; title: string; message: string | null; videoUrl: string; votingDays: 3 | 7 | 14 } {
  const opponentUsername = cleanSingleLine(i.opponentUsername, 'Opponent', {
    max: LIMITS.usernameMax,
    required: true,
  })
  const title = cleanSingleLine(i.title, 'Title', { max: CHALLENGE_LIMITS.titleMax, required: true })
  if (opponentUsername === undefined || title === undefined) throw badInput('Opponent and title are required.')
  if (containsLink(title)) throw badInput("Title can't contain links.")

  const message = cleanMultiLine(i.message, 'Message', { max: CHALLENGE_LIMITS.messageMax }) ?? null
  if (message !== null && containsLink(message)) throw badInput("Message can't contain links.")

  const videoUrl = cleanHttpsUrl(i.videoUrl, 'Video link', { max: LIMITS.url })

  const votingDays = i.votingDays
  if (votingDays !== 3 && votingDays !== 7 && votingDays !== 14) throw badInput('Choose 3, 7 or 14 days.')

  return { opponentUsername, title, message, videoUrl, votingDays }
}

/**
 * Why this challenger may not send a new challenge right now, or null if they may.
 * Checked in order: pair already waiting, decline cooldown, too many waiting, too many today.
 */
export function createBlockReason(i: {
  pendingOutgoing: number
  createdLast24h: number
  pairPending: boolean
  lastDeclinedAt: Date | null
  now: Date
}): string | null {
  if (i.pairPending) return 'You already have a challenge with this DJ waiting.'

  if (i.lastDeclinedAt) {
    const retryAt = new Date(i.lastDeclinedAt.getTime() + CHALLENGE_LIMITS.declineCooldownDays * DAY_MS)
    if (i.now.getTime() < retryAt.getTime()) {
      const when = retryAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return `This DJ declined your last challenge. You can try again on ${when}.`
    }
  }

  if (i.pendingOutgoing >= CHALLENGE_LIMITS.pendingOutgoing) {
    return `You have ${CHALLENGE_LIMITS.pendingOutgoing} challenges waiting for an answer. Wait for a reply or withdraw one.`
  }
  if (i.createdLast24h >= CHALLENGE_LIMITS.perDay) {
    return `You can send ${CHALLENGE_LIMITS.perDay} challenges a day. Try again tomorrow.`
  }
  return null
}

/** The duel opens at local midnight today and closes votingDays calendar days later (local-day math, like battleStatus). */
export function battleDatesForAccept(now: Date, votingDays: number): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + votingDays)
  return { start, end }
}

export type DuelOutcome = 'CHALLENGER_WON' | 'OPPONENT_WON' | 'DRAW'

/** A tie, including 0-0, is a draw: duels have no runoff. */
export function duelOutcome(challengerVotes: number, opponentVotes: number): DuelOutcome {
  if (challengerVotes > opponentVotes) return 'CHALLENGER_WON'
  if (opponentVotes > challengerVotes) return 'OPPONENT_WON'
  return 'DRAW'
}

export function viewerRole(
  c: { challengerId: string; opponentId: string },
  userId: string | null
): 'CHALLENGER' | 'OPPONENT' | null {
  if (userId === null) return null
  if (userId === c.challengerId) return 'CHALLENGER'
  if (userId === c.opponentId) return 'OPPONENT'
  return null
}
