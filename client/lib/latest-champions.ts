/**
 * The home page "Latest champions" strip. Pure, so the rules are unit-tested. The server decides
 * who won (`winners`, only for completed battles) and each person's career wins (`hallOfFame`);
 * this only picks the most recent results and words them.
 */
import { displayName, joinNames, type Person } from './hall-of-fame-view'

export interface LatestBattle {
  id: string
  title: string
  endDate: string
  status: string
  winningVotes: number | null
  winners: Person[]
}

export interface HallOfFameWins {
  wins: number
  user: { id: string }
}

export interface ChampionCard {
  battleId: string
  battleTitle: string
  endDate: string
  winners: Person[]
  winningVotes: number | null
  /** Shown only for a single winner (a tie has no one number to show) who is in the Hall of Fame list. */
  careerWins: number | null
}

export const LATEST_CHAMPIONS_COUNT = 3

/** The most recent completed battles that have a winner, newest first. */
export function buildLatestChampions(
  battles: readonly LatestBattle[],
  hallOfFame: readonly HallOfFameWins[],
  limit: number = LATEST_CHAMPIONS_COUNT,
): ChampionCard[] {
  const winsByUser = new Map(hallOfFame.map((row) => [row.user.id, row.wins]))
  return battles
    .filter((b) => b.status === 'COMPLETED' && b.winners.length > 0)
    .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime() || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((b) => ({
      battleId: b.id,
      battleTitle: b.title,
      endDate: b.endDate,
      winners: b.winners,
      winningVotes: b.winningVotes,
      careerWins: b.winners.length === 1 ? (winsByUser.get(b.winners[0].id) ?? null) : null,
    }))
}

/** "nova" / "won Scratch Showdown", or "kay and nova" / "tied for Midnight Routine". */
export function championHeadline(card: ChampionCard): { name: string; action: string } {
  return {
    name: joinNames(card.winners.map(displayName)),
    action: `${card.winners.length > 1 ? 'tied for' : 'won'} ${card.battleTitle}`,
  }
}
