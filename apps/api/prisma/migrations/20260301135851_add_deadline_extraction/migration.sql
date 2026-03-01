-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "deadline_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deadline_extracted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "extracted_deadlines" (
    "id" TEXT NOT NULL,
    "firm_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "client_id" UUID,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "confidence" VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
    "alert_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extracted_deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extracted_deadlines_firm_id_idx" ON "extracted_deadlines"("firm_id");

-- CreateIndex
CREATE INDEX "extracted_deadlines_firm_id_date_idx" ON "extracted_deadlines"("firm_id", "date");

-- CreateIndex
CREATE INDEX "extracted_deadlines_document_id_idx" ON "extracted_deadlines"("document_id");

-- AddForeignKey
ALTER TABLE "extracted_deadlines" ADD CONSTRAINT "extracted_deadlines_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_deadlines" ADD CONSTRAINT "extracted_deadlines_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_deadlines" ADD CONSTRAINT "extracted_deadlines_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
