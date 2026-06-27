-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "last_activity_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "firms" ADD COLUMN     "client_allowance" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "whatsapp_links" (
    "id" TEXT NOT NULL,
    "firm_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "wa_id" VARCHAR(32) NOT NULL,
    "wa_name" VARCHAR(100),
    "alerts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "linked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "whatsapp_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_links_user_id_key" ON "whatsapp_links"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_links_wa_id_key" ON "whatsapp_links"("wa_id");

-- CreateIndex
CREATE INDEX "whatsapp_links_firm_id_idx" ON "whatsapp_links"("firm_id");

-- CreateIndex
CREATE INDEX "clients_firm_id_last_activity_at_idx" ON "clients"("firm_id", "last_activity_at");

-- AddForeignKey
ALTER TABLE "whatsapp_links" ADD CONSTRAINT "whatsapp_links_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_links" ADD CONSTRAINT "whatsapp_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
