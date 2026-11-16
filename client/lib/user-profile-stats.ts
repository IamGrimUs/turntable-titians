/**
 * What the public profile's stat row shows. Pure, so the rules are unit-tested.
 *
 * "Battles entered" is the number of entries: the rules allow one entry per user per battle,
 * so it needs no extra data. "Battles won" comes from the server, which only counts completed
 * battles (votes are secret until then). The crew card appears only when the user has one.
 */

export interface ProfileStatsInput {
  battlesWon?: number | null
  submissions: ReadonlyArray<unknown>
  externalCrews?: ReadonlyArray<string> | null
}

export interface ProfileStats {
  battlesWon: number
  battlesEntered: number
  /** Null when the user has no crew: the card is not shown. */
  crew: { label: string; names: string } | null
}

export function buildProfileStats(user: ProfileStatsInput): ProfileStats {
  const crews = (user.externalCrews ?? []).map((c) => c.trim()).filter((c) => c.length > 0)
  return {
    battlesWon: user.battlesWon ?? 0,
    battlesEntered: user.submissions.length,
    crew: crews.length === 0 ? null : { label: crews.length === 1 ? 'Crew' : 'Crews', names: crews.join(', ') },
  }
}
