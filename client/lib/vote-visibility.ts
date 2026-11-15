/**
 * Vote counts are secret while a battle is running and revealed when it completes.
 * The server enforces that (it sends `voteCount: null` until then); this module decides
 * how the page reacts: neutral ordering, no leader badges, and a visible "hidden" state.
 */

export type BattleStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED'

export const VOTES_HIDDEN_HINT = 'Vote counts are hidden until the battle ends'

export interface Rankable {
  voteCount: number | null
}

export function rankSubmissions<T extends Rankable>(submissions: T[], status: BattleStatus) {
  const votesRevealed = status === 'COMPLETED'
  if (!votesRevealed) {
    // Keep the server's order (oldest first). Sorting by votes here would reveal who is ahead.
    return { ordered: [...submissions], votesRevealed, maxVoteCount: 0, hasWinner: false }
  }
  // Array.prototype.sort is stable, so ties keep the server's oldest-first order.
  const ordered = [...submissions].sort((a, b) => (b.voteCount ?? 0) - (a.voteCount ?? 0))
  const maxVoteCount = ordered.length > 0 ? Math.max(...ordered.map((s) => s.voteCount ?? 0)) : 0
  return { ordered, votesRevealed, maxVoteCount, hasWinner: maxVoteCount > 0 }
}

export function formatVoteCount(voteCount: number | null) {
  if (voteCount === null) return { hidden: true as const, text: 'vote count hidden', hint: VOTES_HIDDEN_HINT }
  return { hidden: false as const, text: String(voteCount) }
}
