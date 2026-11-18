/**
 * How an entry on the battle page is dressed: crowned, rank badge, podium border. Pure, so the
 * rules are unit-tested without React.
 *
 * The page never works out who won. A crown goes only to a user the server lists in
 * `battle.winners`. While a runoff exists (OPEN, DECIDED or TIED) round-one ranks are not
 * standings any more: a tie for first would otherwise look like two winners, so rank badges and the
 * podium border are switched off and the crown alone says who won (nobody while OPEN).
 *
 * A head to head duel has no round-one standings at all: `battle.winners` is empty, so the crown
 * comes from `duel.winner` (found by user id, never by position: the two entries are created
 * together), and there are never rank badges or a podium border. A draw crowns nobody.
 */
import type { BattleStatus } from './vote-visibility'

export type EntryBadge = 'RANK_2' | 'RANK_3' | null

export interface EntryStyleInput {
  battleStatus: BattleStatus
  /** True when `battle.runoff` is not null. */
  hasRunoff: boolean
  /** Ids of `battle.winners` (the server's answer). */
  winnerUserIds: readonly string[]
  userId: string
  /** 1-based place in the round-one list shown on the page. */
  rank: number
  voteCount: number | null
  /** Set for a head to head duel: the id of `duel.winner` (null for a draw or before the end). */
  duel?: { winnerId: string | null } | null
}

export interface EntryStyle {
  isWinner: boolean
  badge: EntryBadge
  /**
   * Gold border for first place by round-one rank, kept from before runoffs (it also shows on a
   * completed battle nobody voted in). Off whenever a runoff exists.
   */
  podium: boolean
}

export function entryStyle(i: EntryStyleInput): EntryStyle {
  if (i.duel) {
    const isWinner = i.battleStatus === 'COMPLETED' && i.duel.winnerId !== null && i.duel.winnerId === i.userId
    return { isWinner, badge: null, podium: false }
  }
  const isWinner = i.battleStatus === 'COMPLETED' && i.winnerUserIds.includes(i.userId)
  if (i.hasRunoff) return { isWinner, badge: null, podium: false }

  const podium = i.battleStatus === 'COMPLETED' && i.rank === 1
  const hasVotes = (i.voteCount ?? 0) > 0
  let badge: EntryBadge = null
  if (!isWinner && hasVotes) {
    if (i.rank === 2) badge = 'RANK_2'
    else if (i.rank === 3) badge = 'RANK_3'
  }
  return { isWinner, badge, podium }
}
