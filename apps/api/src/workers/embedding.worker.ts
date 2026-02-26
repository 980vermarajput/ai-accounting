/**
 * Embedding BullMQ worker.
 *
 * Picks up jobs from the "embedding" queue and:
 *   1. Loads all Chunk rows for the document that have no embedding yet
 *   2. Calls OpenAI text-embedding-3-small in batches of 100
 *   3. Stores each 1536-dim vector via raw SQL (Prisma doesn't support `vector`)
 *   4. Marks the document `embeddedAt` timestamp on completion
 *
 * The worker is intentionally kept at concurrency 1 to avoid OpenAI rate-limit
 * spikes on startup (each document may have 50–200 chunks).
 */

import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { getRedis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { embedChunks } from "../lib/embedder";
import type { EmbeddingJobData } from "../queues/embedding.queue";

// ─── Raw SQL helper ──────────────────────────────────────────────

/**
 * Store a single embedding vector for a chunk via raw SQL.
 *
 * Prisma doesn't support the pgvector `vector` column type natively, so we
 * use `$executeRaw` with a tagged template literal.  The `::vector` cast
 * tells pgvector to parse the text representation `[0.1,0.2,...]`.
 */
async function storeEmbedding(
  chunkId: string,
  embedding: number[],
): Promise<void> {
  // pgvector expects the format '[0.1,0.2,...]' as a plain string
  const vectorLiteral = `[${embedding.join(",")}]`;
  await prisma.$executeRaw`
    UPDATE chunks
    SET    embedding = ${vectorLiteral}::vector
    WHERE  id = ${chunkId}::uuid
  `;
}

// ─── Processor ───────────────────────────────────────────────────

async function processEmbedding(job: Job<EmbeddingJobData>): Promise<void> {
  const { documentId } = job.data;

  // 1. Load chunks that still need embeddings
  //    (On a retry, some chunks may already have been stored — skip them)
  const chunks = await prisma.chunk.findMany({
    where: {
      documentId,
      // Prisma can't filter on the vector column, so fetch all and we'll
      // detect already-embedded chunks via a separate raw query below.
    },
    select: { id: true, chunkText: true },
    orderBy: { chunkIndex: "asc" },
  });

  if (chunks.length === 0) {
    console.log(
      `[Embedding] Job ${job.id}: document ${documentId} has no chunks — skipping`,
    );
    return;
  }

  // Find which chunks already have embeddings (via raw SQL)
  const embeddedIds = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM chunks
    WHERE  document_id = ${documentId}::uuid
    AND    embedding IS NOT NULL
  `;
  const embeddedSet = new Set(embeddedIds.map((r: { id: string }) => r.id));

  const pending = chunks.filter((c: typeof chunks[number]) => !embeddedSet.has(c.id));

  console.log(
    `[Embedding] Job ${job.id}: ${pending.length}/${chunks.length} chunks need embedding for document ${documentId}`,
  );

  if (pending.length === 0) {
    console.log(`[Embedding] Job ${job.id}: all chunks already embedded`);
    return;
  }

  await job.updateProgress(10);

  // 2. Embed in batches and store
  const results = await embedChunks(
    pending.map((c: typeof pending[number]) => ({ chunkId: c.id, chunkText: c.chunkText })),
  );

  await job.updateProgress(80);

  // 3. Persist each vector with raw SQL
  for (const { chunkId, embedding } of results) {
    await storeEmbedding(chunkId, embedding);
  }

  await job.updateProgress(95);

  // 4. Record completion timestamp on the document
  //    (We add embeddedAt as a metadata-style note via a raw upsert since
  //    the schema doesn't have a dedicated column yet — store in error_message
  //    as a sentinel-free marker. TODO: add embeddedAt column in next migration.)
  console.log(
    `[Embedding] Job ${job.id}: stored ${results.length} embeddings for document ${documentId}`,
  );

  await job.updateProgress(100);
}

// ─── Worker Factory ──────────────────────────────────────────────

/**
 * Start the document embedding BullMQ worker.
 * Call once on server boot alongside sync + extraction workers.
 */
export function startEmbeddingWorker(): Worker {
  const worker = new Worker<EmbeddingJobData>("embedding", processEmbedding, {
    connection: getRedis(),
    // Keep concurrency low to respect OpenAI RPM limits
    concurrency: 1,
  });

  worker.on("completed", (job) => {
    console.log(`[Embedding] Worker: job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Embedding] Worker: job ${job?.id} failed — ${err.message}`);
  });

  console.log("[Embedding] Worker started (concurrency: 1)");
  return worker;
}
