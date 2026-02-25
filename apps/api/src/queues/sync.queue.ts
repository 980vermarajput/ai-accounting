import { Queue } from "bullmq";
import { getRedis } from "../lib/redis";

// ─── Shared Job Data ─────────────────────────────────────────────

/**
 * Data payload for both gmail-sync and drive-sync BullMQ jobs.
 * Matches the SyncJob DB record so the worker can update progress.
 */
export interface SyncJobData {
  userId: string;
  firmId: string;
  syncJobId: string; // FK to prisma SyncJob.id
}

// ─── Shared Queue Options ────────────────────────────────────────

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
  // Keep last 100 completed / 200 failed jobs in Redis for debugging
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 200 },
};

// ─── Queues ──────────────────────────────────────────────────────

export const gmailSyncQueue = new Queue<SyncJobData>("gmail-sync", {
  connection: getRedis(),
  defaultJobOptions,
});

export const driveSyncQueue = new Queue<SyncJobData>("drive-sync", {
  connection: getRedis(),
  defaultJobOptions,
});
