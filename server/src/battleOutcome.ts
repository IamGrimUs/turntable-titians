import { winnersOfBattle } from './battleResults'
import { placesInBattle } from './battlePlacement'

/**
 * The one place that decides who won a completed battle and who placed where, runoff included.
 * Pure: no database access.
 *
 * When a completed battle ties for first, voting reopens on just the tied entries (the runoff)
 * so it can end with one winner. Without a tie for first the result is exactly round one
 * (`winnersOfBattle` / `placesInBattle`). A runoff that ends level stays tied and the tied
 * entries share the win.
 *
 * Known limit: results are computed from live vote rows, so deleting a user (their votes cascade)
 * after a battle ended can change its result. This already applied to round one; a runoff can also
 * appear or disappear if it happens within the runoff window. It only happens through an admin
 * deletion.
 */

/** How many days the runoff stays open, counting the first (the day after the end date). */
export const RUNOFF_DAYS = 3

export interface OutcomeEntry {
  id: string
  userId: string
  votes: number
}

export type RunoffPhase = 'NOT_YET' | 'OPEN' | 'CLOSED'

// Same local-day rule as `computeBattleStatus`.
function toDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

/** The runoff opens the day after the end date; `endsAt` is its last open day. Local midnight. */
export function runoffWindow(endDate: Date): { opensAt: Date; endsAt: Date } {
  const end = toDay(endDate)
  return { opensAt: addDays(end, 1), endsAt: addDays(end, RUNOFF_DAYS) }
}

export function runoffPhase(endDate: Date, now: Date): RunoffPhase {
  const { opensAt, endsAt } = runoffWindow(endDate)
  const today = toDay(now)
  if (today < opensAt) return 'NOT_YET'
  if (today <= endsAt) return 'OPEN'
  return 'CLOSED'
}

/** The entries sharing the top vote count, or none unless that count is above zero and shared. */
export function tiedForFirst(entries: ReadonlyArray<OutcomeEntry>): OutcomeEntry[] {
  let max = 0
  for (const e of entries) if (e.votes > max) max = e.votes
  if (max <= 0) return []
  const top = entries.filter((e) => e.votes === max)
  return top.length >= 2 ? top : []
}

export interface BattleResolution {
  /** True only while a runoff is OPEN. */
  pending: boolean
  /** Empty while pending and when nobody won. */
  winnerUserIds: Set<string>
  /** userId to place. Empty while pending. */
  places: Map<string, number>
  /** Runoff candidate votes are null while OPEN (they stay secret until it closes). */
  runoff: null | {
    status: 'OPEN' | 'DECIDED' | 'TIED'
    candidates: Array<{ id: string; userId: string; votes: number | null }>
  }
}

export function resolveBattle(input: {
  endDate: Date
  entries: ReadonlyArray<OutcomeEntry>
  /** Runoff vote count per candidate entry id; a missing entry has none. */
  runoffVotes: ReadonlyMap<string, number>
  now: Date
}): BattleResolution {
  const { endDate, entries, runoffVotes, now } = input
  const tied = tiedForFirst(entries)
  const phase = runoffPhase(endDate, now)

  if (tied.length === 0 || phase === 'NOT_YET') {
    return {
      pending: false,
      winnerUserIds: winnersOfBattle(entries),
      places: placesInBattle(entries),
      runoff: null,
    }
  }

  if (phase === 'OPEN') {
    return {
      pending: true,
      winnerUserIds: new Set(),
      places: new Map(),
      runoff: {
        status: 'OPEN',
        candidates: tied.map((c) => ({ id: c.id, userId: c.userId, votes: null })),
      },
    }
  }

  const candidates = tied.map((c) => ({ id: c.id, userId: c.userId, votes: runoffVotes.get(c.id) ?? 0 }))
  const top = Math.max(...candidates.map((c) => c.votes))
  const winners = candidates.filter((c) => c.votes === top)

  // Non-candidates keep their round-one place; candidates are re-ranked by runoff votes.
  const places = placesInBattle(entries)
  const candidateIds = new Set(candidates.map((c) => c.userId))
  for (const userId of candidateIds) places.delete(userId)
  for (const c of candidates) {
    const place = candidates.filter((other) => other.votes > c.votes).length + 1
    const best = places.get(c.userId)
    if (best === undefined || place < best) places.set(c.userId, place)
  }

  return {
    pending: false,
    winnerUserIds: new Set(winners.map((c) => c.userId)),
    places,
    runoff: { status: winners.length === 1 ? 'DECIDED' : 'TIED', candidates },
  }
}
