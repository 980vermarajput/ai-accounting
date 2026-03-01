-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('INVOICE_OVERDUE', 'CLIENT_SILENT', 'DEADLINE_DETECTED', 'HIGH_RISK_LANGUAGE', 'SYNC_FAILURE', 'TOKEN_CAP_WARNING');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "firm_id" UUID NOT NULL,
    "client_id" UUID,
    "type" "AlertType" NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_briefings" (
    "id" TEXT NOT NULL,
    "firm_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "client_count" INTEGER NOT NULL DEFAULT 0,
    "alert_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_briefings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_firm_id_idx" ON "alerts"("firm_id");

-- CreateIndex
CREATE INDEX "alerts_firm_id_type_is_read_idx" ON "alerts"("firm_id", "type", "is_read");

-- CreateIndex
CREATE INDEX "alerts_firm_id_severity_idx" ON "alerts"("firm_id", "severity");

-- CreateIndex
CREATE INDEX "daily_briefings_firm_id_idx" ON "daily_briefings"("firm_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_briefings_firm_id_date_key" ON "daily_briefings"("firm_id", "date");

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_briefings" ADD CONSTRAINT "daily_briefings_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
