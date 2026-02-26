-- Re-add pgvector embedding column that was accidentally dropped.
-- The vector extension was already created in the 20260225085839 migration.

ALTER TABLE "chunks" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON "chunks" USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);