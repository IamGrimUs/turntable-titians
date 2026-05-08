-- DropForeignKey
ALTER TABLE "CrewMember" DROP CONSTRAINT "CrewMember_userId_fkey";

-- CreateIndex
CREATE INDEX "Vote_battleId_idx" ON "Vote"("battleId");

-- AddForeignKey
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
