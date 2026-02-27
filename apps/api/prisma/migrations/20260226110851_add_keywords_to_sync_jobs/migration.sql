-- AlterTable
ALTER TABLE "sync_jobs" ADD COLUMN     "include_all_keywords" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
