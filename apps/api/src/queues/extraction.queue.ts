import { Queue, Job } from "bullmq";
import { getRedis } from "../lib/redis";

// ─── Job payload ─────────────────────────────────────────────────

export interface ExtractionJobData {
  /** Prisma Document UUID — used to update status on completion/failure */
  documentId: string;
  userId: string;
  firmId: string;
  /** Source type controls which download path the worker takes */
  source: "gmail" | "drive" | "upload";
  /** Gmail messageId or Drive fileId */
  sourceId: string;
  /** MIME type of the stored document (may differ after Google Workspace export) */
  mimeType: string;
}

// ─── Queue ───────────────────────────────────────────────────────

export const extractionQueue = new Queue<ExtractionJobData>("extraction", {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

// ─── Job adder ───────────────────────────────────────────────────

/**
 * Enqueue a document extraction job.
 *
 * Uses `extract:<documentId>` as the BullMQ job ID so a document can never
 * have two extraction jobs queued simultaneously.
 */
export async function addExtractionJob(
  data: ExtractionJobData,
): Promise<Job<ExtractionJobData>> {
  return extractionQueue.add("extract-document", data, {
    jobId: `extract:${data.documentId}`,
  });
}
