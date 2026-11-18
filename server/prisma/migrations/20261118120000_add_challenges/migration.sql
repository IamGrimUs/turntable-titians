-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "challengeEmails" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "challengerId" TEXT NOT NULL,
    "opponentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "challengerVideoUrl" TEXT NOT NULL,
    "votingDays" INTEGER NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "battleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_battleId_key" ON "Challenge"("battleId");

-- CreateIndex
CREATE INDEX "Challenge_challengerId_createdAt_idx" ON "Challenge"("challengerId", "createdAt");

-- CreateIndex
CREATE INDEX "Challenge_opponentId_status_idx" ON "Challenge"("opponentId", "status");

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

