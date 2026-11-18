/**
 * What a battle card on the Battles page says about status, winner and runoff. Pure, so it is
 * unit-tested. Nothing here decides who won: the server sends `winners` and the runoff.
 */
import { summarizeRunoff, winnerLine, type ListRunoff, type Person } from './hall-of-fame-view'

export type CardStatusVariant = 'upcoming' | 'active' | 'completed' | 'runoff'

export interface CardBattle {
  status: string
  winners?: ReadonlyArray<Pick<Person, 'username' | 'name'>> | null
  runoff?: ListRunoff | null
}

export interface CardView {
  /** The text of the status pill: the battle status, or the runoff label for a battle with a runoff. */
  statusLabel: string
  statusVariant: CardStatusVariant
  /** "Won by ann" / "Tied: ann and bob" for a battle with no runoff; null otherwise. */
  winnerLine: string | null
  /** The runoff line; `crown` is true once the runoff is over (a winner or a shared win), never while open. */
  runoffLine: { text: string; crown: boolean } | null
}

const STATUS_VARIANTS: Record<string, CardStatusVariant> = {
  UPCOMING: 'upcoming',
  ACTIVE: 'active',
  COMPLETED: 'completed',
}

export function battleCardView(battle: CardBattle): CardView {
  const variant = STATUS_VARIANTS[battle.status] ?? 'upcoming'
  const runoff = battle.status === 'COMPLETED' ? summarizeRunoff(battle.runoff) : null

  if (runoff) {
    return {
      statusLabel: runoff.label,
      statusVariant: runoff.status === 'OPEN' ? 'runoff' : variant,
      winnerLine: null,
      runoffLine: { text: runoff.line, crown: runoff.status !== 'OPEN' },
    }
  }

  return {
    statusLabel: battle.status,
    statusVariant: variant,
    // The server only fills in winners for a completed battle with at least one vote.
    winnerLine: battle.status === 'COMPLETED' ? winnerLine(battle.winners ?? []) : null,
    runoffLine: null,
  }
}
