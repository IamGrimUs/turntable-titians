import { computeBattleStatus } from './battleStatus'
import type { Role } from './permissions'
import { isSuspended } from './suspension'

export interface AdminUserRow {
  id: string
  username: string | null
  name: string | null
  image: string | null
  email: string
  role: Role
  status: 'ACTIVE' | 'SUSPENDED'
  suspendedUntil: Date | null
  suspensionReason: string | null
  crews: string[]
  entries: number
  battlesWon: number
  votesCast: number
  votesReceived: number
  createdAt: Date
  lastSignInAt: Date
}

export interface StatsInput {
  users: Array<{
    id: string
    username: string | null
    name: string | null
    image: string | null
    email: string
    role: Role
    externalCrews: string[]
    internalCrewNames: string[]
    createdAt: Date
    lastSignInAt: Date
    suspendedAt: Date | null
    suspendedUntil: Date | null
    suspensionReason: string | null
  }>
  submissions: Array<{ id: string; userId: string; battleId: string }>
  voteCountsBySubmission: Map<string, number>
  votesCastByUser: Map<string, number>
  battles: Array<{ id: string; startDate: Date; endDate: Date }>
}

function mergeCrews(internal: string[], external: string[]): string[] {
  const seen = new Set<string>()
  const crews: string[] = []
  for (const name of [...internal, ...external]) {
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    crews.push(name)
  }
  return crews
}

/**
 * Turns plain rows and count maps into the admin table rows. Pure: no database access,
 * inputs are never modified. "Battles won" counts COMPLETED battles (status derived from
 * the dates) where the user's entry has the top vote count and that count is above zero;
 * ties award every tied user.
 */
export function buildAdminUserRows(input: StatsInput, now: Date = new Date()): AdminUserRow[] {
  const completedBattleIds = new Set<string>()
  for (const battle of input.battles) {
    if (computeBattleStatus(battle.startDate, battle.endDate, now) === 'COMPLETED') {
      completedBattleIds.add(battle.id)
    }
  }

  const entriesByUser = new Map<string, number>()
  const votesReceivedByUser = new Map<string, number>()
  const submissionsByBattle = new Map<string, Array<{ userId: string; votes: number }>>()

  for (const sub of input.submissions) {
    const votes = input.voteCountsBySubmission.get(sub.id) ?? 0
    entriesByUser.set(sub.userId, (entriesByUser.get(sub.userId) ?? 0) + 1)
    votesReceivedByUser.set(sub.userId, (votesReceivedByUser.get(sub.userId) ?? 0) + votes)

    if (!completedBattleIds.has(sub.battleId)) continue
    const list = submissionsByBattle.get(sub.battleId)
    if (list) list.push({ userId: sub.userId, votes })
    else submissionsByBattle.set(sub.battleId, [{ userId: sub.userId, votes }])
  }

  const winsByUser = new Map<string, number>()
  for (const entries of submissionsByBattle.values()) {
    let max = 0
    for (const e of entries) if (e.votes > max) max = e.votes
    if (max <= 0) continue
    // A user counts once per battle even if several of their entries tie for the top.
    const winners = new Set<string>()
    for (const e of entries) if (e.votes === max) winners.add(e.userId)
    for (const userId of winners) winsByUser.set(userId, (winsByUser.get(userId) ?? 0) + 1)
  }

  return input.users.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    image: u.image,
    email: u.email,
    role: u.role,
    status: isSuspended(u, now) ? 'SUSPENDED' : 'ACTIVE',
    suspendedUntil: u.suspendedUntil,
    suspensionReason: u.suspensionReason,
    crews: mergeCrews(u.internalCrewNames, u.externalCrews),
    entries: entriesByUser.get(u.id) ?? 0,
    battlesWon: winsByUser.get(u.id) ?? 0,
    votesCast: input.votesCastByUser.get(u.id) ?? 0,
    votesReceived: votesReceivedByUser.get(u.id) ?? 0,
    createdAt: u.createdAt,
    lastSignInAt: u.lastSignInAt,
  }))
}
