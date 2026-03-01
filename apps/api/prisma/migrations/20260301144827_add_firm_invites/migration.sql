-- CreateTable
CREATE TABLE "firm_invites" (
    "id" TEXT NOT NULL,
    "firm_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "email" VARCHAR(255),
    "role" "UserRole" NOT NULL DEFAULT 'member',
    "used_by" UUID,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "firm_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "firm_invites_token_key" ON "firm_invites"("token");

-- CreateIndex
CREATE INDEX "firm_invites_firm_id_idx" ON "firm_invites"("firm_id");

-- CreateIndex
CREATE INDEX "firm_invites_token_idx" ON "firm_invites"("token");

-- AddForeignKey
ALTER TABLE "firm_invites" ADD CONSTRAINT "firm_invites_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firm_invites" ADD CONSTRAINT "firm_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firm_invites" ADD CONSTRAINT "firm_invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
