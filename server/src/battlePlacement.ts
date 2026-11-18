/**
 * Placements, personal records and the Hall of Fame ranking. Pure: no database access.
 *
 * Callers pass only COMPLETED battles (vote counts are secret until then). `placesInBattle`
 * is the round-one rule; a battle that ties for first may be settled by a runoff, so the
 * record and the ranking take each battle's final `places` (and `pending`) as data from
 * `resolveBattle` rather than recomputing them. A battle in an open runoff is `pending` and
 * is skipped entirely. A test pins round-one first place to `winnersOfBattle`.
 */
export interface EntryVotes {
  userId: string
  votes: number
}

/**
 * Each user's place in one completed battle: standard competition ranking, so two entries
 * tied for first are both 1 and the next is 3. Entries with no votes do not place, so a
 * battle nobody voted in places nobody.
 */
export function placesInBattle(entries: ReadonlyArray<EntryVotes>): Map<string, number> {
  const voted = entries.filter((e) => e.votes > 0)
  const places = new Map<string, number>()
  for (const e of voted) {
    const place = voted.filter((other) => other.votes > e.votes).length + 1
    const best = places.get(e.userId)
    if (best === undefined || place < best) places.set(e.userId, place)
  }
  return places
}

export interface BattleResult {
  battleId: string
  endDate: Date
  /** Null when the user entered but did not place (no votes). */
  place: number | null
  /** A runoff is still open: the battle is left out of the record entirely. */
  pending: boolean
}

export interface UserRecord {
  wins: number
  /** Finished first, second or third. */
  podiums: number
  /** Lowest place number reached, or null if the user never placed. */
  bestFinish: number | null
  /** Wins in a row ending at the most recent battle entered; 0 if that one was not a win. */
  currentStreak: number
  bestStreak: number
  battlesEntered: number
}

/**
 * A user's record from their results in completed battles. Streaks run over the battles the
 * user entered, in end-date order (ties by battle id), so battles they skipped never break one.
 * Pending battles (runoff still open) are skipped entirely, so they neither count nor break a streak.
 */
export function summarizeRecord(results: ReadonlyArray<BattleResult>): UserRecord {
  const ordered = results.filter((r) => !r.pending).sort(
    (a, b) => a.endDate.getTime() - b.endDate.getTime() || a.battleId.localeCompare(b.battleId)
  )
  const record: UserRecord = {
    wins: 0,
    podiums: 0,
    bestFinish: null,
    currentStreak: 0,
    bestStreak: 0,
    battlesEntered: ordered.length,
  }
  let streak = 0
  for (const r of ordered) {
    if (r.place === 1) {
      record.wins++
      streak++
      if (streak > record.bestStreak) record.bestStreak = streak
    } else {
      streak = 0
    }
    if (r.place !== null) {
      if (r.place <= 3) record.podiums++
      if (record.bestFinish === null || r.place < record.bestFinish) record.bestFinish = r.place
    }
  }
  record.currentStreak = streak
  return record
}

export interface CompletedBattleEntries {
  id: string
  endDate: Date
  /** Who entered; used for "battles entered". */
  entries: ReadonlyArray<{ userId: string }>
  /** Final places by user id (runoff included), decided by `resolveBattle`. Empty while pending. */
  places: ReadonlyMap<string, number>
  /** A runoff is still open: skipped entirely (no entry, no win). */
  pending: boolean
}

export interface ChampionRow {
  userId: string
  /** Standard competition rank by wins: equal wins share a rank (1, 2, 2, 4). */
  rank: number
  wins: number
  /** Completed battles the user entered, wins or not. */
  battlesEntered: number
  lastWinAt: Date
}

/**
 * Everyone with at least one win, ranked by wins. Equal wins are ordered by most recent win
 * first, then by user id, so the list is stable.
 */
export function rankChampions(battles: ReadonlyArray<CompletedBattleEntries>): ChampionRow[] {
  const entered = new Map<string, number>()
  const wins = new Map<string, { count: number; last: Date }>()

  for (const battle of battles) {
    if (battle.pending) continue
    const seen = new Set(battle.entries.map((e) => e.userId))
    for (const userId of seen) entered.set(userId, (entered.get(userId) ?? 0) + 1)
    for (const [userId, place] of battle.places) {
      if (place !== 1) continue
      const current = wins.get(userId)
      wins.set(userId, {
        count: (current?.count ?? 0) + 1,
        last: current && current.last > battle.endDate ? current.last : battle.endDate,
      })
    }
  }

  const sorted = [...wins.entries()].sort(
    ([idA, a], [idB, b]) => b.count - a.count || b.last.getTime() - a.last.getTime() || idA.localeCompare(idB)
  )
  return sorted.map(([userId, w]) => ({
    userId,
    rank: sorted.findIndex(([, other]) => other.count === w.count) + 1,
    wins: w.count,
    battlesEntered: entered.get(userId) ?? 0,
    lastWinAt: w.last,
  }))
}
