/*
  Warnings:

  - You are about to drop the column `embedding` on the `chunks` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "idx_chunks_embedding";

-- AlterTable
ALTER TABLE "chunks" DROP COLUMN "embedding";
