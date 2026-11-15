-- Admin roles, suspensions, audit log, banned emails, and cascading deletes.
--
-- Adding the Vote -> User foreign key fails if any vote points at a user that no longer exists
-- (Vote.userId had no relation before). Check for orphans first; expect 0 rows:
--   SELECT v.id FROM "Vote" v LEFT JOIN "User" u ON u.id = v."userId" WHERE u.id IS NULL;
-- The other four relations already have foreign keys, so they cannot hold orphans.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'OWNER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER',
ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "suspendedUntil" TIMESTAMP(3),
ADD COLUMN "suspensionReason" TEXT,
ADD COLUMN "lastSignInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: a user cannot exist without having signed in once.
UPDATE "User" SET "lastSignInAt" = "createdAt";

-- CreateTable
CREATE TABLE "BannedEmail" (
    "email" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "BannedEmail_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "actorUsername" TEXT,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetUsername" TEXT,
    "targetEmail" TEXT,
    "details" JSONB NOT NULL,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- DropForeignKey
ALTER TABLE "Submission" DROP CONSTRAINT "Submission_userId_fkey";

-- DropForeignKey
ALTER TABLE "Submission" DROP CONSTRAINT "Submission_battleId_fkey";

-- DropForeignKey
ALTER TABLE "Vote" DROP CONSTRAINT "Vote_submissionId_fkey";

-- DropForeignKey
ALTER TABLE "Vote" DROP CONSTRAINT "Vote_battleId_fkey";

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
