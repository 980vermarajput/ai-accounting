-- DropIndex
DROP INDEX "idx_chunks_embedding";

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "entities" JSONB,
ADD COLUMN     "summary" TEXT;

-- AlterTable
ALTER TABLE "firms" ADD COLUMN     "knowledge_snapshot" TEXT;
