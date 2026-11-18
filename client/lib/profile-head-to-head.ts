import { challengeUserName } from './challenge-screen'
import { headToHeadText } from './challenge-view'
import { plural } from './plural'

/**
 * Pure helpers for the two head to head pieces of the public profile: the "Challenge <name>" button
 * and the "Head to head" card. Display decisions only: the server decides who may challenge whom
 * and what every duel result is. Nothing here touches career wins or the trophy shelf.
 */

/** The card's label under the record: duels are never part of the career numbers. */
export const HEAD_TO_HEAD_NOTE = 'Kept separate: does not count toward career wins'

/** At most this many recent results are listed (the query asks for the same number). */
const RESULTS_SHOWN = 5

// --- The Challenge button ------------------------------------------------------------------------

function cleanUsername(value: string | null | undefined): string | null {
  const username = value?.trim()
  return username ? username : null
}

/**
 * Whether to offer "Challenge <name>": only to a signed-in viewer who has a username, on the
 * profile of another DJ who has a username. A signed-out visitor never gets a link to a gated page
 * (the sign-in bounce would drop `?to=`). The server re-checks everything.
 */
export function canChallenge(
  viewer: { id?: string | null; username?: string | null } | null | undefined,
  profileUser: { id?: string | null; username?: string | null } | null | undefined,
): boolean {
  if (!viewer?.id || !cleanUsername(viewer.username)) return false
  if (!profileUser || !cleanUsername(profileUser.username)) return false
  return viewer.id !== profileUser.id
}

/** The challenge form with the DJ prefilled. */
export function challengeHref(username: string): string {
  return `/challenges/new?to=${encodeURIComponent(username.trim())}`
}

export interface ChallengeButtonView {
  label: string
  href: string
}

/** The button to render, or null when there should be none. */
export function challengeButtonView(
  viewer: { id?: string | null; username?: string | null } | null | undefined,
  profileUser: { id?: string | null; username?: string | null } | null | undefined,
): ChallengeButtonView | null {
  if (!canChallenge(viewer, profileUser)) return null
  const username = cleanUsername(profileUser?.username)
  if (!username) return null
  return { label: `Challenge ${username}`, href: challengeHref(username) }
}

// --- The Head to head card -----------------------------------------------------------------------

export interface HeadToHeadResultInput {
  battleId?: string | null
  result?: string | null
  endedAt?: string | null
  opponent?: { username?: string | null; name?: string | null } | null
}

export interface HeadToHeadInput {
  wins?: number | null
  losses?: number | null
  draws?: number | null
  results?: ReadonlyArray<HeadToHeadResultInput> | null
}

export interface HeadToHeadRowView {
  key: string
  href: string
  opponentName: string
  /** The kind as sent by the server (WON, LOST, DRAW), for styling. */
  kind: string
  kindLabel: string
}

export interface HeadToHeadCardView {
  /** '3 - 1 - 1': wins, losses, draws. */
  recordText: string
  /** The same record in words, for screen readers. */
  recordLabel: string
  note: string
  rows: HeadToHeadRowView[]
}

const KIND_LABELS: Record<string, string> = { WON: 'Won', LOST: 'Lost', DRAW: 'Draw' }

function count(n: number | null | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * The card to show, or null when there is none to show: no record (older cached data, a failed
 * query) or no finished duel yet. Never an empty card or a placeholder. The server only sends
 * results of finished duels, so nothing about an open duel can appear here, and a result carries
 * no vote counts, so none is shown.
 */
export function headToHeadCard(record: HeadToHeadInput | null | undefined): HeadToHeadCardView | null {
  if (!record) return null
  const wins = count(record.wins)
  const losses = count(record.losses)
  const draws = count(record.draws)
  if (wins + losses + draws === 0) return null

  const rows: HeadToHeadRowView[] = []
  for (const r of (record.results ?? []).slice(0, RESULTS_SHOWN)) {
    if (!r.battleId) continue
    const kind = r.result ?? ''
    rows.push({
      key: r.battleId,
      href: `/battles/${encodeURIComponent(r.battleId)}`,
      opponentName: challengeUserName(r.opponent ? { username: r.opponent.username ?? null, name: r.opponent.name ?? null } : null),
      kind,
      kindLabel: Object.prototype.hasOwnProperty.call(KIND_LABELS, kind) ? KIND_LABELS[kind] : 'Result',
    })
  }

  return {
    recordText: headToHeadText({ wins, losses, draws }),
    recordLabel: `${plural(wins, 'win')}, ${plural(losses, 'loss', 'losses')}, ${plural(draws, 'draw')}`,
    note: HEAD_TO_HEAD_NOTE,
    rows,
  }
}
