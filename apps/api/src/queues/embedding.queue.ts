import type { Job } from "bullmq";
import { Queue } from "bullmq";
import { getRedis } from "../lib/redis";

// ─── Job payload ─────────────────────────────────────────────────

export interface EmbeddingJobData {
  /** Prisma Document UUID — used to load chunks and update status. */
  documentId: string;
  firmId: string;
}

// ─── Queue ───────────────────────────────────────────────────────

export const embeddingQueue = new Queue<EmbeddingJobData>("embedding", {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

// ─── Job adder ───────────────────────────────────────────────────

/**
 * Enqueue an embedding job for a document whose chunks are already stored.
 *
 * Uses `embed-<documentId>` as the BullMQ job ID to prevent duplicate embedding
 * jobs from queuing up if the extraction worker retries.
 * Note: BullMQ forbids colons in custom job IDs (conflicts with Redis key format).
 */
export async function addEmbeddingJob(
  data: EmbeddingJobData,
): Promise<Job<EmbeddingJobData>> {
  return embeddingQueue.add("embed-document", data, {
    jobId: `embed-${data.documentId}`,
  });
}
