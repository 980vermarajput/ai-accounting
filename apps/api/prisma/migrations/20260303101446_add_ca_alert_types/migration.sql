-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertType" ADD VALUE 'GST_FILING_DUE';
ALTER TYPE "AlertType" ADD VALUE 'TDS_PAYMENT_DUE';
ALTER TYPE "AlertType" ADD VALUE 'ITR_FILING_DUE';
ALTER TYPE "AlertType" ADD VALUE 'MISSING_DOCUMENTS';
ALTER TYPE "AlertType" ADD VALUE 'DOCUMENT_EXPIRY';
