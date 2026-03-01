-- CreateTable
CREATE TABLE "telegram_links" (
    "id" TEXT NOT NULL,
    "firm_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "telegram_chat_id" BIGINT NOT NULL,
    "telegram_username" VARCHAR(100),
    "alerts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "linked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_user_id_key" ON "telegram_links"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_telegram_chat_id_key" ON "telegram_links"("telegram_chat_id");

-- CreateIndex
CREATE INDEX "telegram_links_firm_id_idx" ON "telegram_links"("firm_id");

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
