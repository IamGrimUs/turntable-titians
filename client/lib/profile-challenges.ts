import {
  challengeActions,
  challengeBadgeVariant,
  challengeStatusFor,
  challengeUserName,
  effectiveChallengeStatus,
  groupMyChallenges,
  timeLeftLabel,
  type ChallengeBadgeVariant,
  type ChallengeRole,
  type ChallengeRow,
} from './challenge-view'
import { plural } from './plural'

/**
 * Pure helpers for the profile's challenge pieces: the nav count, the "Your challenges" section and
 * the "Email me about challenges" setting. Display decisions only; the server decides everything else.
 */

// --- Nav count -----------------------------------------------------------------------------------

/** How often the nav count is refreshed. */
export const CHALLENGES_WAITING_POLL_MS = 5 * 60 * 1000

/** Options for `useQuery(GET_CHALLENGES_WAITING)`: no request at all when signed out. */
export function waitingQueryOptions(signedIn: boolean): { skip: boolean; pollInterval: number } {
  return { skip: !signedIn, pollInterval: CHALLENGES_WAITING_POLL_MS }
}

/**
 * The count to show. The server's `challengesWaiting` already leaves out expired challenges, so it is
 * used as sent; anything that is not a sensible count (loading, null, negative) is 0.
 */
export function waitingCount(data: { challengesWaiting?: number | null } | undefined, signedIn: boolean): number {
  if (!signedIn) return 0
  const n = data?.challengesWaiting
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** The text inside the pill: capped at "9+" so it never widens the 375px bottom nav. Empty for 0. */
export function waitingCountText(count: number): string {
  if (count <= 0) return ''
  return count > 9 ? '9+' : String(count)
}

/** The Profile link's accessible name; keeps the true number even when the pill says "9+". */
export function waitingAriaLabel(count: number): string {
  return count > 0 ? `Profile, ${plural(count, 'challenge')} waiting` : 'Profile'
}

// --- "Your challenges" ---------------------------------------------------------------------------

/** What a row needs. A superset of nothing sensitive: no message, no video link, no email. */
export interface MyChallengeInput extends ChallengeRow {
  viewerRole: ChallengeRole
}

export interface MyChallengeRowView {
  id: string
  href: string
  /** The other DJ (never the viewer). */
  otherName: string
  title: string
  /** The effective status: a waiting challenge past `expiresAt` is EXPIRED. */
  status: string
  statusLabel: string
  badgeVariant: ChallengeBadgeVariant
  /** Only a still-waiting challenge has time left. */
  timeLeft: string | null
  /** "Respond" for the opponent of a waiting challenge; Withdraw lives on the screen, so no label here. */
  actionLabel: 'Respond' | null
}

export function myChallengeRow(c: MyChallengeInput, now: Date = new Date()): MyChallengeRowView {
  // Effective status first, so an expired waiting challenge shows no action.
  const status = effectiveChallengeStatus(c, now)
  const actions = challengeActions({ viewerRole: c.viewerRole, status, battleId: c.battleId })
  const other = c.viewerRole === 'CHALLENGER' ? c.opponent : c.challenger
  return {
    id: c.id,
    href: `/challenges/${c.id}`,
    otherName: challengeUserName(other),
    title: c.title,
    status,
    statusLabel: challengeStatusFor(c.viewerRole, status),
    badgeVariant: challengeBadgeVariant(status),
    timeLeft: status === 'PENDING' ? timeLeftLabel(c.expiresAt, now) : null,
    actionLabel: actions.includes('RESPOND') ? 'Respond' : null,
  }
}

export interface MyChallengesSection {
  key: 'waiting' | 'sent' | 'recent'
  title: string
  rows: MyChallengeRowView[]
}

/** The groups to show, empty ones left out. An empty array means the whole section is hidden. */
export function myChallengesSections(list: MyChallengeInput[] | null | undefined, now: Date = new Date()): MyChallengesSection[] {
  const { waitingForMe, sent, recent } = groupMyChallenges(list ?? [], now)
  const sections: MyChallengesSection[] = [
    { key: 'waiting', title: 'Waiting for you', rows: waitingForMe.map((c) => myChallengeRow(c, now)) },
    { key: 'sent', title: 'Sent', rows: sent.map((c) => myChallengeRow(c, now)) },
    { key: 'recent', title: 'Recent', rows: recent.map((c) => myChallengeRow(c, now)) },
  ]
  return sections.filter((s) => s.rows.length > 0)
}

// --- Email opt-out -------------------------------------------------------------------------------

/** `User.challengeEmails` is null (or absent) until set, and null means on. Only `false` is off. */
export function challengeEmailsChecked(value: boolean | null | undefined): boolean {
  return value !== false
}

export interface ProfileFormValues {
  username: string
  image: string
  crews: string[]
  challengeEmails: boolean
  /** The value `me` had when the form loaded (null or absent means on). */
  loadedChallengeEmails: boolean | null | undefined
}

/**
 * The `updateProfile` variables: username, image and crews as the form always sent them. The checkbox
 * is sent only when it differs from the value loaded from `me`, as a real boolean, so a stale second
 * tab that was never touched cannot switch emails back on (the server ignores what it is not sent).
 */
export function profileUpdateVariables(v: ProfileFormValues) {
  const vars: { username: string; image: string; externalCrews: string[]; challengeEmails?: boolean } = {
    username: v.username,
    image: v.image,
    externalCrews: v.crews,
  }
  if (v.challengeEmails !== challengeEmailsChecked(v.loadedChallengeEmails)) vars.challengeEmails = v.challengeEmails
  return vars
}
