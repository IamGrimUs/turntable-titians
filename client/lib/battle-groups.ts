import { BATTLE_TYPES } from './battle-types'

/** Heading for a battle that has no type. */
export const NO_TYPE_LABEL = 'Other'

export interface BattleGroup<T> {
  type: string
  battles: T[]
}

const STATUS_RANK: Record<string, number> = { ACTIVE: 0, UPCOMING: 1, COMPLETED: 2 }

/**
 * Groups battles under their type for the battles page. Pure, so the rules are unit-tested.
 *
 * - Groups follow the order the app lists the types (`BATTLE_TYPES`). A type that is not in that list
 *   (an older or unexpected value) gets its own group after them, in the order first seen, and a
 *   battle with no type goes under "Other" last. Empty groups are never returned.
 * - Inside a group, Active battles come first, then Upcoming, then Completed. Battles with the same
 *   status keep the order they were given in (the API sends newest first); the sort is stable.
 * - The input is never modified.
 */
export function groupBattlesByType<T extends { type?: string | null; status: string }>(
  battles: readonly T[],
): BattleGroup<T>[] {
  const byType = new Map<string, T[]>()
  for (const battle of battles) {
    const type = battle.type?.trim() || NO_TYPE_LABEL
    const list = byType.get(type)
    if (list) list.push(battle)
    else byType.set(type, [battle])
  }

  const known = BATTLE_TYPES.filter((t) => byType.has(t))
  const unknown = [...byType.keys()].filter((t) => !BATTLE_TYPES.includes(t) && t !== NO_TYPE_LABEL)
  const order = [...known, ...unknown, ...(byType.has(NO_TYPE_LABEL) ? [NO_TYPE_LABEL] : [])]

  return order.map((type) => ({
    type,
    battles: [...byType.get(type)!].sort(
      (a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3),
    ),
  }))
}
