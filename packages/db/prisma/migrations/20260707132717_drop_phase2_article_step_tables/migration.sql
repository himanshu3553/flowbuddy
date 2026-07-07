/*
  Warnings:

  - You are about to drop the `Article` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Step` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Article" DROP CONSTRAINT "Article_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "Article" DROP CONSTRAINT "Article_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "Step" DROP CONSTRAINT "Step_articleId_fkey";

-- DropTable
DROP TABLE "Article";

-- DropTable
DROP TABLE "Step";
