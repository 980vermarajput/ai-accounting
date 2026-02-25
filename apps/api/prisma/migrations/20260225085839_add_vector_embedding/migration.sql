-- Add pgvector embedding column to chunks table
ALTER TABLE "chunks" ADD COLUMN "embedding" vector(1536);

-- IVFFlat index for cosine similarity search
CREATE INDEX idx_chunks_embedding ON "chunks"
USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- RLS policies — enable row-level security on all tenant tables
-- (These will be enforced once roles and policies are set up in production)
ALTER TABLE "firms"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clients"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chunks"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "queries"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_jobs"  ENABLE ROW LEVEL SECURITY;
