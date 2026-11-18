import type { ApolloCache } from '@apollo/client'
import { getEmbedUrl } from '@/app/battles/[id]/getEmbedUrl'
import {
  challengeActions,
  challengeStatusFor,
  effectiveChallengeStatus,
  videoUrlError,
  type ChallengeRole,
} from './challenge-view'
import { plural } from './plural'

/**
 * Pure helpers for the challenge screen (`/challenges/[id]`). Display decisions only: the server
 * decides who may do what and what the status is.
 *
 * Fairness: the challenger's video is hidden from the opponent until they accept. The server only
 * returns `challengerVideoUrl` to the challenger of a waiting challenge; `ownEntryLink` is the one
 * place the client lets it reach the screen, and it hands it out to that person only.
 */

export type ChallengeScreenKind = 'RESPOND' | 'WAITING' | 'ACCEPTED' | 'CLOSED'

export interface ChallengeScreenView {
  kind: ChallengeScreenKind
  /** The effective status (a waiting challenge past `expiresAt` is EXPIRED). */
  status: string
  /** The badge text from the viewer's side ("Waiting for you", "Waiting", "Expired", ...). */
  statusLabel: string
  /** Only a waiting challenge has time left to show. */
  showTimeLeft: boolean
  battleId: string | null
}

/**
 * Which screen to show for this viewer. It takes the effective status first (so a challenge that
 * expired while the page was open shows no actions), then asks `challengeActions`.
 */
export function challengeScreenView(
  c: { viewerRole: ChallengeRole; status: string; expiresAt: string; battleId: string | null },
  now: Date = new Date(),
): ChallengeScreenView {
  const status = effectiveChallengeStatus(c, now)
  const actions = challengeActions({ viewerRole: c.viewerRole, status, battleId: c.battleId })
  let kind: ChallengeScreenKind = 'CLOSED'
  if (actions.includes('RESPOND')) kind = 'RESPOND'
  else if (actions.includes('WITHDRAW')) kind = 'WAITING'
  else if (actions.includes('OPEN_BATTLE')) kind = 'ACCEPTED'
  return {
    kind,
    status,
    statusLabel: challengeStatusFor(c.viewerRole, status),
    showTimeLeft: status === 'PENDING',
    battleId: c.battleId,
  }
}

/**
 * The challenger's own entry link, for the challenger only and only while the challenge is waiting
 * and the link is a plain https link. Everyone else gets null, even if the field were present: the
 * opponent's screen must never show or link the video.
 */
export function ownEntryLink(
  c: {
    viewerRole: ChallengeRole
    status: string
    expiresAt: string
    battleId: string | null
    challengerVideoUrl: string | null
  },
  now: Date = new Date(),
): string | null {
  if (c.viewerRole !== 'CHALLENGER') return null
  if (challengeScreenView(c, now).kind !== 'WAITING') return null
  const url = c.challengerVideoUrl
  if (!url) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** "12 career wins"; null when the number is not known. */
export function careerWinsText(wins: number | null | undefined): string | null {
  return typeof wins === 'number' ? plural(wins, 'career win') : null
}

export function challengeHeadline(role: ChallengeRole, challengerName: string, opponentName: string): string {
  return role === 'OPPONENT' ? `${challengerName} challenged you` : `You challenged ${opponentName}`
}

/** The three rules of the battle that starts when the challenge is accepted. */
export function challengeRuleBullets(votingDays: number, challengerName: string): string[] {
  return [
    `Voting runs for ${votingDays} days once you accept.`,
    `You and ${challengerName} cannot vote in this battle.`,
    'Vote counts stay hidden until the battle ends.',
  ]
}

/** The plain statement for a challenge with no actions left, from the viewer's side. */
export function challengeClosedStatement(status: string, role: ChallengeRole, otherName: string): string {
  switch (status) {
    case 'DECLINED':
      return role === 'OPPONENT' ? 'You declined this challenge.' : `${otherName} declined this challenge.`
    case 'WITHDRAWN':
      return role === 'CHALLENGER' ? 'You withdrew this challenge.' : `${otherName} withdrew this challenge.`
    case 'EXPIRED':
      return 'This challenge expired before it was answered.'
    case 'ACCEPTED':
      return 'This challenge was accepted.'
    default:
      return 'This challenge is closed.'
  }
}

/** The accept mutation arguments: the id and the trimmed link, nothing else. */
export function acceptVariables(id: string, videoUrl: string): { id: string; videoUrl: string } {
  return { id, videoUrl: videoUrl.trim() }
}

/** The live preview of the opponent's own link: only a valid https YouTube link embeds. */
export function previewEmbedUrl(videoUrl: string): string | null {
  const url = videoUrl.trim()
  if (videoUrlError(url) !== null) return null
  return getEmbedUrl(url)
}

/** Where to go after accepting: the new battle. */
export function battlePath(id: string): string {
  return `/battles/${encodeURIComponent(id)}`
}

/** True for NOT_FOUND: a stranger and a missing challenge look the same, and both get the friendly page. */
export function isChallengeUnavailable(error: unknown): boolean {
  const list = (error as { graphQLErrors?: readonly unknown[] } | null | undefined)?.graphQLErrors
  if (!Array.isArray(list)) return false
  return list.some((item) => (item as { extensions?: { code?: unknown } } | null)?.extensions?.code === 'NOT_FOUND')
}

/**
 * Once a challenge is no longer waiting, forget the cached challenger link on `Challenge:<id>` so a
 * closed (declined, withdrawn, accepted) challenge never keeps it in the browser cache. A challenge
 * that is not cached is left alone.
 */
export function clearChallengerVideo(
  cache: ApolloCache<unknown>,
  challenge: { id: string; status: string } | null | undefined,
): void {
  if (!challenge || challenge.status === 'PENDING') return
  const id = cache.identify({ __typename: 'Challenge', id: challenge.id })
  if (!id) return
  cache.modify({ id, fields: { challengerVideoUrl: () => null } })
}
