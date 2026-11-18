/**
 * A duel is a battle whose `duel` is set; `null` (or a missing field) is a regular battle.
 * Kept in its own file with no imports so the view modules can share it without an import cycle.
 */
export function isDuel(battle: { duel?: unknown }): boolean {
  return battle.duel !== null && battle.duel !== undefined
}
