/**
 * What the Battles page shows for head to head duels (1v1 challenges). Pure, so it is unit-tested.
 * Duels are a separate group, never mixed into the regular battles, the Hall of Fame results tab or
 * the home strip. Nothing here decides an outcome: the server sends `duel.outcome`, the votes and
 * `winner`, and they are null until the duel is COMPLETED.
 */
import { battleCardView, type CardStatusVariant } from './battle-card-view'
import { challengeUserName, duelResultLine } from './challenge-view'
import type { Person } from './hall-of-fame-view'

/** A duel is a battle whose `duel` is set; `null` (or a missing field) is a regular battle. */
export function isDuel(battle: { duel?: unknown }): boolean {
  return battle.duel !== null && battle.duel !== undefined
}

/** Splits a battle list into regular battles and duels, keeping the given order inside each group. */
export function splitDuels<T extends { duel?: unknown | null }>(battles: readonly T[]): { regular: T[]; duels: T[] } {
  const regular: T[] = []
  const duels: T[] = []
  for (const battle of battles) (isDuel(battle) ? duels : regular).push(battle)
  return { regular, duels }
}

const DUEL_STATUS_ORDER: Record<string, number> = { ACTIVE: 0, UPCOMING: 1, COMPLETED: 2 }

/**
 * The duels for the Battles page group: ACTIVE first, then UPCOMING, then COMPLETED. Inside a status
 * the incoming order is kept (the server sends newest first); an unknown status goes last. Returns a new array.
 */
export function orderDuels<T extends { status: string }>(duels: readonly T[]): T[] {
  const rank = (status: string) => DUEL_STATUS_ORDER[status] ?? Object.keys(DUEL_STATUS_ORDER).length
  // Array.prototype.sort is stable, so equal statuses keep their incoming order.
  return [...duels].sort((a, b) => rank(a.status) - rank(b.status))
}

/** The fields of GET_BATTLES that a duel card uses. */
export interface DuelBattle {
  id: string
  title: string
  status: string
  duel: {
    challenger: Person
    opponent: Person
    outcome: string | null
    challengerVotes: number | null
    opponentVotes: number | null
    winner: { id: string } | null
  } | null
}

export type DuelSide = 'CHALLENGER' | 'OPPONENT'

export interface DuelCardView {
  statusLabel: string
  statusVariant: CardStatusVariant
  challengerName: string
  opponentName: string
  /** 'kay won, 62 to 48' / 'Draw, 40 to 40'; null until the duel is COMPLETED. */
  resultLine: string | null
  /** True only for a decided duel: never for a draw or an unfinished duel. */
  crown: boolean
  /** The winning DJ, found by user id (never by the order of the entries); null for a draw or an unfinished duel. */
  winnerSide: DuelSide | null
}

/** The status pill, both DJs' names and the result line for one duel card. */
export function duelCardView(battle: DuelBattle): DuelCardView {
  const { statusLabel, statusVariant } = battleCardView({ status: battle.status })
  const duel = battle.duel
  const challengerName = challengeUserName(duel?.challenger)
  const opponentName = challengeUserName(duel?.opponent)
  const view: DuelCardView = { statusLabel, statusVariant, challengerName, opponentName, resultLine: null, crown: false, winnerSide: null }
  // The server fills in the result only once the battle is COMPLETED; never show one earlier.
  if (!duel || battle.status !== 'COMPLETED') return view

  view.resultLine = duelResultLine(duel, { challenger: challengerName, opponent: opponentName })
  const decided = duel.outcome === 'CHALLENGER_WON' || duel.outcome === 'OPPONENT_WON'
  if (!decided) return view

  view.crown = true
  if (duel.winner?.id === duel.challenger.id) view.winnerSide = 'CHALLENGER'
  else if (duel.winner?.id === duel.opponent.id) view.winnerSide = 'OPPONENT'
  else view.winnerSide = duel.outcome === 'CHALLENGER_WON' ? 'CHALLENGER' : 'OPPONENT'
  return view
}

/**
 * What the regular part of the Battles page shows. 'EMPTY': no battles of any kind, so the usual
 * "No battles yet" with the create button. 'NO_REGULAR': only duels exist, so no filters and no
 * "No battles yet" (that would be untrue); just a short note above the Head to head group.
 */
export type BattlesListState = 'EMPTY' | 'NO_REGULAR' | 'REGULAR'

export function battlesListState(regularCount: number, duelCount: number): BattlesListState {
  if (regularCount > 0) return 'REGULAR'
  return duelCount > 0 ? 'NO_REGULAR' : 'EMPTY'
}

export const DUEL_BADGE_LABEL = 'Head to head'

/** The sign-in prompt's ending for a signed-out visitor ("Sign in <this>"). */
export function duelSignInText(duel: boolean): string {
  return duel ? 'to vote.' : 'to submit your entry.'
}

export interface DuelPageView {
  /** '<A> vs <B>': the heading of the battle page. */
  headline: string
  /** The challenge's own title, kept under the headline. */
  subtitle: string
  badgeLabel: string
  /** One line saying what this page is; accurate for the battle's status. */
  intro: string
  /** The server's result line; null until the duel is COMPLETED. */
  resultLine: string | null
  /** Nobody can add an entry to a duel: the entries come from the challenge. */
  canAddEntry: false
}

/** What the battle page shows for a duel; null for a regular battle. */
export function duelPageView(battle: { title: string; status: string; duel: DuelBattle['duel'] }): DuelPageView | null {
  if (!battle.duel) return null
  const card = duelCardView({ id: '', title: battle.title, status: battle.status, duel: battle.duel })
  const base = `A 1v1 between ${card.challengerName} and ${card.opponentName}.`
  return {
    headline: `${card.challengerName} vs ${card.opponentName}`,
    subtitle: battle.title,
    badgeLabel: DUEL_BADGE_LABEL,
    intro: battle.status === 'ACTIVE' ? `${base} Everyone else can vote.` : base,
    resultLine: card.resultLine,
    canAddEntry: false,
  }
}
