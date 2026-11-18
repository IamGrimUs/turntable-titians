import { db } from './db'
import { regularBattleWhere } from './battleKind'
import { buildAdminUserRows, type AdminUserRow } from './adminUserStats'

/**
 * Loads the rows for the admin users table. Stats (entries, wins, votes) always come from the
 * full submission, vote and battle data, because one user's "battles won" depends on other
 * users' entries; `userIds` only narrows which users are returned.
 */
export async function loadAdminUserRows(userIds?: string[]): Promise<AdminUserRow[]> {
  const [users, submissions, votesBySubmission, votesByUser, runoffBySubmission, battles, ideasByAuthor] = await Promise.all([
    db.user.findMany({
      ...(userIds ? { where: { id: { in: userIds } } } : {}),
      include: { internalCrews: { select: { crew: { select: { name: true } } } } },
    }),
    db.submission.findMany({ select: { id: true, userId: true, battleId: true } }),
    db.vote.groupBy({ by: ['submissionId'], _count: true }),
    db.vote.groupBy({ by: ['userId'], _count: true }),
    // Runoff tallies per entry: only used to settle "battles won", never the vote columns.
    db.runoffVote.groupBy({ by: ['submissionId'], _count: true }),
    // Regular battles only: this list feeds "battles won", and duels never count as wins. Duel
    // submissions and votes still count in entries, votes cast and votes received (real activity).
    db.battle.findMany({ where: regularBattleWhere, select: { id: true, startDate: true, endDate: true } }),
    // Board ideas, hidden ones included (the user's real posting volume). Comments and votes are not counted.
    db.idea.groupBy({ by: ['authorId'], _count: true }),
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
    runoffVotesBySubmission: new Map(runoffBySubmission.map((v) => [v.submissionId, v._count])),
    votesCastByUser: new Map(votesByUser.map((v) => [v.userId, v._count])),
    ideasPostedByUser: new Map(ideasByAuthor.map((i) => [i.authorId, i._count])),
    battles,
  })
}
