/**
 * The one definition of "who won a battle", shared by the admin users table and the public
 * profile. Pure: no database access.
 *
 * Callers pass only the entries of a COMPLETED battle (vote counts are secret until then).
 * The winner is the entry with the most votes, as long as that count is above zero: a battle
 * nobody voted in has no winner. Ties award every tied user, and a user counts once even if
 * several of their entries tie for the top.
 */
export function winnersOfBattle(entries: ReadonlyArray<{ userId: string; votes: number }>): Set<string> {
  let max = 0
  for (const e of entries) if (e.votes > max) max = e.votes
  const winners = new Set<string>()
  if (max <= 0) return winners
  for (const e of entries) if (e.votes === max) winners.add(e.userId)
  return winners
}
