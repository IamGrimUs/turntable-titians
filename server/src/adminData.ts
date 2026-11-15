import { db } from './db'
import { buildAdminUserRows, type AdminUserRow } from './adminUserStats'

/**
 * Loads the rows for the admin users table. Stats (entries, wins, votes) always come from the
 * full submission, vote and battle data, because one user's "battles won" depends on other
 * users' entries; `userIds` only narrows which users are returned.
 */
export async function loadAdminUserRows(userIds?: string[]): Promise<AdminUserRow[]> {
  const [users, submissions, votesBySubmission, votesByUser, battles] = await Promise.all([
    db.user.findMany({
      ...(userIds ? { where: { id: { in: userIds } } } : {}),
      include: { internalCrews: { select: { crew: { select: { name: true } } } } },
    }),
    db.submission.findMany({ select: { id: true, userId: true, battleId: true } }),
    db.vote.groupBy({ by: ['submissionId'], _count: true }),
    db.vote.groupBy({ by: ['userId'], _count: true }),
    db.battle.findMany({ select: { id: true, startDate: true, endDate: true } }),
  ])

  return buildAdminUserRows({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      image: u.image,
      email: u.email,
      role: u.role,
      externalCrews: u.externalCrews,
      internalCrewNames: u.internalCrews.map((m) => m.crew.name),
      createdAt: u.createdAt,
      lastSignInAt: u.lastSignInAt,
      suspendedAt: u.suspendedAt,
      suspendedUntil: u.suspendedUntil,
      suspensionReason: u.suspensionReason,
    })),
    submissions,
    voteCountsBySubmission: new Map(votesBySubmission.map((v) => [v.submissionId, v._count])),
    votesCastByUser: new Map(votesByUser.map((v) => [v.userId, v._count])),
    battles,
  })
}
