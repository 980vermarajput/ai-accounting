-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "gmail_thread_id" VARCHAR(255);

-- CreateIndex
CREATE INDEX "documents_gmail_thread_id_idx" ON "documents"("gmail_thread_id");
