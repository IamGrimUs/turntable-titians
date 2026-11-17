-- CreateEnum
CREATE TYPE "IdeaCategory" AS ENUM ('BUG', 'SUGGESTION', 'OTHER');

-- CreateEnum
CREATE TYPE "IdeaTopic" AS ENUM ('BATTLES', 'VOTING', 'PROFILES', 'LOGIN_ACCOUNT', 'SITE_WIDE');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('OPEN', 'PLANNED', 'IN_PROGRESS', 'DONE', 'DECLINED');

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "IdeaCategory" NOT NULL,
    "topic" "IdeaTopic",
    "status" "IdeaStatus" NOT NULL DEFAULT 'OPEN',
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdeaVote" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdeaComment" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdeaCommentVote" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaCommentVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Idea_category_status_idx" ON "Idea"("category", "status");

-- CreateIndex
CREATE INDEX "Idea_createdAt_idx" ON "Idea"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdeaVote_ideaId_userId_key" ON "IdeaVote"("ideaId", "userId");

-- CreateIndex
CREATE INDEX "IdeaComment_ideaId_idx" ON "IdeaComment"("ideaId");

-- CreateIndex
CREATE UNIQUE INDEX "IdeaCommentVote_commentId_userId_key" ON "IdeaCommentVote"("commentId", "userId");

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaVote" ADD CONSTRAINT "IdeaVote_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaVote" ADD CONSTRAINT "IdeaVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaComment" ADD CONSTRAINT "IdeaComment_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaComment" ADD CONSTRAINT "IdeaComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaCommentVote" ADD CONSTRAINT "IdeaCommentVote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "IdeaComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaCommentVote" ADD CONSTRAINT "IdeaCommentVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

