/**
 * Display rules for the Hall of Fame and the winner lines on battle cards. Pure, so they are
 * unit-tested. "Who won" is never worked out here: the server sends `winners` and
 * `winningVotes` (only for completed battles) and `hallOfFame` already ranked.
 */
import { NO_TYPE_LABEL, groupBattlesByType } from './battle-groups'
import { formatShortDate, joinNames } from './display-format'
import { isDuel } from './duel-view'
import { runoffCardLine, runoffStatusLabel, type RunoffStatus } from './runoff-view'

export { formatShortDate, joinNames }

export interface Person {
  id: string
  username: string | null
  name: string | null
  image: string | null
}

export function displayName(user: Pick<Person, 'username' | 'name'>): string {
  return user.username ?? user.name ?? 'DJ'
}

export function initialsOf(user: Pick<Person, 'username' | 'name'>): string {
  return displayName(user).slice(0, 2).toUpperCase()
}

/** Wins as a share of the battles entered, e.g. "58%". A dash when there is nothing to divide by. */
export function winRate(wins: number, entered: number): string {
  if (entered <= 0) return '–'
  return `${Math.round((wins / entered) * 100)}%`
}

/** The top three ranks are highlighted. Equal wins share a rank, so more than three rows can qualify. */
export function isTopThree(rank: number): boolean {
  return rank >= 1 && rank <= 3
}

/** "Won by ann", or "Tied: ann and bob". Null when nobody won (nothing is shown). */
export function winnerLine(winners: ReadonlyArray<Pick<Person, 'username' | 'name'>>): string | null {
  const names = winners.map(displayName)
  if (names.length === 0) return null
  return names.length === 1 ? `Won by ${names[0]}` : `Tied: ${joinNames(names)}`
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** The light runoff selection (`RUNOFF_FIELDS`) that the battle lists carry. */
export interface ListRunoff {
  status: RunoffStatus
  endsAt: string
  candidates: ReadonlyArray<{ submission: { user: Pick<Person, 'username' | 'name'> }; votes: number | null }>
}

/** A runoff as words: the pill label and one ready-made line. */
export interface RunoffSummary {
  status: RunoffStatus
  label: string
  line: string
}

/**
 * The runoff of a list battle as a pill label and a line, or null when there is none. Candidates
 * stay in the order the server sent them (never sorted by votes); an open runoff never shows counts.
 */
export function summarizeRunoff(runoff: ListRunoff | null | undefined): RunoffSummary | null {
  if (!runoff) return null
  const candidates = runoff.candidates.map((c) => ({ name: displayName(c.submission.user), votes: c.votes }))
  return {
    status: runoff.status,
    label: runoffStatusLabel(runoff.status),
    line: runoffCardLine(runoff.status, candidates, runoff.endsAt),
  }
}

/** The fields of GET_BATTLE_RESULTS this view uses. */
export interface ResultBattle {
  id: string
  title: string
  type: string | null
  endDate: string
  status: string
  winners: Person[]
  winningVotes: number | null
  submissions: ReadonlyArray<{ id: string }> | null
  runoff?: ListRunoff | null
  /** Set for a head to head duel, which never appears here (duels have their own group on the Battles page). */
  duel?: { outcome: string | null } | null
}

export interface ResultRow {
  id: string
  title: string
  type: string
  endDate: string
  entries: number
  winners: Array<{ user: Person; votes: number | null }>
  tie: boolean
  /** True only for a completed battle with no winner and no runoff to wait for: nobody voted. */
  noWinner: boolean
  /** The runoff status and line, or null when the battle had no tie for first. */
  runoff: RunoffSummary | null
}

/**
 * The Battle results tab: completed battles only, newest end date first (ties by id), optionally
 * one type. A battle still open never appears, whatever the API sent for it. A duel never appears
 * either: it has no winners by design, so it would read as "No winner: nobody voted".
 */
export function buildResultRows(battles: readonly ResultBattle[], typeFilter: string | null): ResultRow[] {
  return battles
    .filter((b) => b.status === 'COMPLETED' && !isDuel(b))
    .map((b) => ({ ...b, type: b.type?.trim() || NO_TYPE_LABEL }))
    .filter((b) => typeFilter === null || b.type === typeFilter)
    .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime() || a.id.localeCompare(b.id))
    .map((b) => {
      const runoff = summarizeRunoff(b.runoff)
      // While a runoff is open the battle has no winner, whatever else was sent for it.
      const winners = runoff?.status === 'OPEN' ? [] : b.winners
      return {
        id: b.id,
        title: b.title,
        type: b.type,
        endDate: b.endDate,
        entries: b.submissions?.length ?? 0,
        // After a runoff the round-one total says nothing about the winner; the runoff line has the result.
        winners: winners.map((user) => ({ user, votes: runoff ? null : b.winningVotes })),
        tie: winners.length > 1,
        // An open runoff has no winner yet, which is not the same as nobody having voted.
        noWinner: winners.length === 0 && runoff?.status !== 'OPEN',
        runoff,
      }
    })
}

export function noWinnerText(entries: number): string {
  return entries === 0 ? 'No entries' : 'No winner: nobody voted'
}

/** Types that have at least one completed battle, in the order the Battles page lists them. */
export function resultTypes(battles: readonly ResultBattle[]): string[] {
  return groupBattlesByType(battles.filter((b) => b.status === 'COMPLETED' && !isDuel(b))).map((g) => g.type)
}

export interface ResultMonth {
  label: string
  rows: ResultRow[]
}

/** Month headings over rows that are already sorted; consecutive rows of one month share a heading. */
export function groupRowsByMonth(rows: readonly ResultRow[]): ResultMonth[] {
  const months: ResultMonth[] = []
  for (const row of rows) {
    const label = monthLabel(row.endDate)
    const last = months[months.length - 1]
    if (last && last.label === label) last.rows.push(row)
    else months.push({ label, rows: [row] })
  }
  return months
}

export const RESULTS_PAGE_SIZE = 10
