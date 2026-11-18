/**
 * Pure view logic for direct challenges and head to head duels. UI display and form hints only:
 * the server decides what is allowed and what the outcome of a duel is, and the client shows it.
 *
 * The client and server share no code, so the limits and rules below mirror
 * server/src/challengeRules.ts (`CHALLENGE_LIMITS`, `cleanChallengeInput`, `effectiveStatus`),
 * server/src/validation.ts (`LIMITS`, `cleanHttpsUrl`) and server/src/boardRules.ts (`containsLink`)
 * by hand. Keep them in step.
 */

/** Mirrors the client-relevant values of `CHALLENGE_LIMITS` and `LIMITS` on the server. */
export const CHALLENGE_LIMITS = {
  titleMax: 100,
  messageMax: 280,
  usernameMax: 30,
  urlMax: 500,
  votingDays: [3, 7, 14],
  answerDays: 10,
} as const

export type ChallengeStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'EXPIRED'
export type ChallengeRole = 'CHALLENGER' | 'OPPONENT'
export type ChallengeAction = 'RESPOND' | 'WITHDRAW' | 'OPEN_BATTLE'
export type ChallengeBadgeVariant = 'upcoming' | 'active' | 'completed' | 'outline'

export interface ChallengeUser {
  id: string
  username: string | null
  name: string | null
  image: string | null
}

/** One row of `myChallenges` (the light selection). */
export interface ChallengeRow {
  id: string
  title: string
  status: string
  viewerRole: ChallengeRole
  battleId: string | null
  expiresAt: string
  createdAt: string
  challenger: ChallengeUser
  opponent: ChallengeUser
}

const DAY_MS = 24 * 60 * 60 * 1000

const STATUS_LABELS: Record<ChallengeStatus, string> = {
  PENDING: 'Waiting',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  WITHDRAWN: 'Withdrawn',
  EXPIRED: 'Expired',
}

/** Unknown values are returned as sent, so a newer server value still shows something. */
export function challengeStatusLabel(status: string): string {
  return Object.prototype.hasOwnProperty.call(STATUS_LABELS, status) ? STATUS_LABELS[status as ChallengeStatus] : status
}

/** The label from the viewer's side: only the opponent of a waiting challenge is "waited for". */
export function challengeStatusFor(role: ChallengeRole, status: string): string {
  if (status === 'PENDING' && role === 'OPPONENT') return 'Waiting for you'
  return challengeStatusLabel(status)
}

/** Maps a status onto the shared `Badge` variants: waiting is amber, accepted green, dead ends muted. */
export function challengeBadgeVariant(status: string): ChallengeBadgeVariant {
  switch (status) {
    case 'PENDING':
      return 'upcoming'
    case 'ACCEPTED':
      return 'active'
    case 'DECLINED':
    case 'WITHDRAWN':
    case 'EXPIRED':
      return 'completed'
    default:
      return 'outline'
  }
}

/**
 * The status as the server computes it: a waiting challenge whose `expiresAt` has passed is EXPIRED
 * (`expiresAt <= now`). The server already sends this; it matters for a challenge that expired while
 * the page was open.
 */
export function effectiveChallengeStatus(c: { status: string; expiresAt: string }, now: Date = new Date()): string {
  if (c.status === 'PENDING' && Date.parse(c.expiresAt) <= now.getTime()) return 'EXPIRED'
  return c.status
}

/** Whole days left, never rounded up: '8 days left', '1 day left', 'Expires today', 'Expired'. */
export function timeLeftLabel(expiresAt: string, now: Date = new Date()): string {
  const left = Date.parse(expiresAt) - now.getTime()
  if (Number.isNaN(left)) return ''
  if (left <= 0) return 'Expired'
  if (left < DAY_MS) return 'Expires today'
  const days = Math.floor(left / DAY_MS)
  return `${days} ${days === 1 ? 'day' : 'days'} left`
}

/** What the viewer can do with a challenge. Pass the effective status (see `effectiveChallengeStatus`). */
export function challengeActions(c: {
  viewerRole: ChallengeRole
  status: string
  battleId: string | null
}): ChallengeAction[] {
  if (c.status === 'PENDING') return [c.viewerRole === 'OPPONENT' ? 'RESPOND' : 'WITHDRAW']
  if (c.status === 'ACCEPTED' && c.battleId) return ['OPEN_BATTLE']
  return []
}

const RECENT_MAX = 5

/**
 * The three groups of "Your challenges": waiting for my answer, sent and waiting, and recent
 * (everything else, including a waiting challenge that has expired), newest first and at most 5.
 * Waiting and sent keep the order they came in (the server sends newest first).
 */
export function groupMyChallenges<C extends { status: string; viewerRole: ChallengeRole; expiresAt: string; createdAt: string }>(
  list: C[],
  now: Date = new Date(),
): { waitingForMe: C[]; sent: C[]; recent: C[] } {
  const waitingForMe: C[] = []
  const sent: C[] = []
  const recent: C[] = []
  for (const c of list) {
    if (effectiveChallengeStatus(c, now) !== 'PENDING') recent.push(c)
    else if (c.viewerRole === 'OPPONENT') waitingForMe.push(c)
    else sent.push(c)
  }
  recent.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return { waitingForMe, sent, recent: recent.slice(0, RECENT_MAX) }
}

// Same rule as the server's `containsLink`: a scheme or a "www." prefix, with a word boundary so a
// stretched word such as "Awww." does not count.
const LINK_PATTERN = /https?:\/\/|\bwww\./i
// Control characters are never valid in one-line text (the server refuses them too).
const SINGLE_LINE_FORBIDDEN = /[\u0000-\u001F\u007F]/

export interface ChallengeFormValues {
  username: string
  title: string
  message: string
  videoUrl: string
  votingDays: number
}

function videoUrlError(value: string): string | null {
  const url = value.trim()
  if (url === '') return 'Video link is required.'
  if (url.length > CHALLENGE_LIMITS.urlMax) return `Video link must be ${CHALLENGE_LIMITS.urlMax} characters or fewer.`
  if (SINGLE_LINE_FORBIDDEN.test(url)) return 'Video link must be a valid link.'
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'Video link must be a valid link.'
  }
  if (parsed.protocol !== 'https:') return 'Video link must be a link that starts with https://'
  if (parsed.username || parsed.password) return 'Video link must not contain a username or password.'
  if (!parsed.hostname.includes('.')) return 'Video link must be a valid link.'
  return null
}

/**
 * The challenge form's rules, field -> message; an empty object when the form is valid. Mirrors
 * `cleanChallengeInput` on the server, which re-checks everything and whose message is what the user
 * sees if it still refuses.
 */
export function validateChallengeForm(v: ChallengeFormValues): Record<string, string> {
  const errors: Record<string, string> = {}

  const username = v.username.trim()
  if (username === '') errors.username = "Enter the DJ's username."
  else if (SINGLE_LINE_FORBIDDEN.test(username)) errors.username = "Username contains characters that aren't allowed."
  else if (username.length > CHALLENGE_LIMITS.usernameMax) {
    errors.username = `Username must be ${CHALLENGE_LIMITS.usernameMax} characters or fewer.`
  }

  const title = v.title.trim()
  if (title === '') errors.title = 'Title is required.'
  else if (SINGLE_LINE_FORBIDDEN.test(title)) errors.title = "Title contains characters that aren't allowed."
  else if (title.length > CHALLENGE_LIMITS.titleMax) {
    errors.title = `Title must be ${CHALLENGE_LIMITS.titleMax} characters or fewer.`
  } else if (LINK_PATTERN.test(title)) errors.title = "Title can't contain links."

  // The server counts a line break once and trims before measuring.
  const message = v.message.replace(/\r\n?/g, '\n').trim()
  if (message.length > CHALLENGE_LIMITS.messageMax) {
    errors.message = `Message must be ${CHALLENGE_LIMITS.messageMax} characters or fewer.`
  } else if (LINK_PATTERN.test(message)) errors.message = "Message can't contain links."

  const videoError = videoUrlError(v.videoUrl)
  if (videoError) errors.videoUrl = videoError

  if (!(CHALLENGE_LIMITS.votingDays as readonly number[]).includes(v.votingDays)) {
    errors.votingDays = 'Choose 3, 7 or 14 days.'
  }

  return errors
}

/**
 * The result of a finished duel, as the server decided it: 'Kay won, 62 to 48' (the winner's votes
 * first) or 'Draw, 40 to 40'. Null until the duel is COMPLETED (`outcome` is null). Never recomputed
 * from the votes.
 */
export function duelResultLine(
  duel: { outcome: string | null; challengerVotes: number | null; opponentVotes: number | null },
  names: { challenger: string; opponent: string },
): string | null {
  const { outcome, challengerVotes, opponentVotes } = duel
  let head: string
  let score: [number, number] | null = null
  const haveCounts = challengerVotes !== null && opponentVotes !== null
  switch (outcome) {
    case 'CHALLENGER_WON':
      head = `${names.challenger} won`
      if (haveCounts) score = [challengerVotes, opponentVotes]
      break
    case 'OPPONENT_WON':
      head = `${names.opponent} won`
      if (haveCounts) score = [opponentVotes, challengerVotes]
      break
    case 'DRAW':
      head = 'Draw'
      if (haveCounts) score = [challengerVotes, opponentVotes]
      break
    default:
      return null
  }
  return score ? `${head}, ${score[0]} to ${score[1]}` : head
}

/** '3 - 1 - 1': wins, losses, draws. */
export function headToHeadText(r: { wins: number; losses: number; draws: number }): string {
  return `${r.wins} - ${r.losses} - ${r.draws}`
}
