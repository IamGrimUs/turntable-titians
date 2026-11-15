-- One entry per user per battle.
-- This fails if any user already has two entries in the same battle; check for those first:
--   SELECT "battleId", "userId", count(*) FROM "Submission" GROUP BY 1, 2 HAVING count(*) > 1;

-- CreateIndex
CREATE UNIQUE INDEX "Submission_battleId_userId_key" ON "Submission"("battleId", "userId");
