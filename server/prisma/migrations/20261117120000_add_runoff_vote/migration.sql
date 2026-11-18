-- CreateTable
CREATE TABLE "RunoffVote" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunoffVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RunoffVote_battleId_idx" ON "RunoffVote"("battleId");

-- CreateIndex
CREATE INDEX "RunoffVote_submissionId_idx" ON "RunoffVote"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RunoffVote_userId_battleId_key" ON "RunoffVote"("userId", "battleId");

-- AddForeignKey
ALTER TABLE "RunoffVote" ADD CONSTRAINT "RunoffVote_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunoffVote" ADD CONSTRAINT "RunoffVote_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunoffVote" ADD CONSTRAINT "RunoffVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

