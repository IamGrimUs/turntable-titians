/**
 * The round-one rule: the entry with the most votes wins, as long as that count is above zero
 * (a battle nobody voted in has no winner). Ties share, and a user counts once even if several
 * of their entries tie for the top. Pure: no database access.
 *
 * This is not the final word on who won: `resolveBattle` in `battleOutcome.ts` is the one
 * definition of that, runoff included, and the only caller of this function outside tests.
 *
 * Callers pass only the entries of a COMPLETED battle (vote counts are secret until then).
 */
export function winnersOfBattle(entries: ReadonlyArray<{ userId: string; votes: number }>): Set<string> {
  let max = 0
  for (const e of entries) if (e.votes > max) max = e.votes
  const winners = new Set<string>()
  if (max <= 0) return winners
  for (const e of entries) if (e.votes === max) winners.add(e.userId)
  return winners
}
