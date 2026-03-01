/**
 * Daily scheduler queue — runs daily cron to generate alerts + briefings.
 *
 * Cron: "30 1 * * *" = 01:30 UTC = 07:00 IST
 * Repeatable job ensures exactly one run per day.
 */

import { Queue } from "bullmq";
import { getRedis } from "../lib/redis";

// ─── Job payload ─────────────────────────────────────────────────

export interface SchedulerJobData {
  /** The trigger source for audit/debug. */
  trigger: "cron" | "manual";
  /** ISO timestamp when the job was enqueued. */
  enqueuedAt: string;
}

// ─── Queue ───────────────────────────────────────────────────────

export const schedulerQueue = new Queue<SchedulerJobData>("daily-scheduler", {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 60_000 },
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 30 },
  },
});

// ─── Setup the repeatable cron job ───────────────────────────────

/**
 * Register the daily repeatable job. Safe to call multiple times —
 * BullMQ de-duplicates based on the repeat key.
 */
export async function registerDailySchedule(): Promise<void> {
  await schedulerQueue.upsertJobScheduler(
    "daily-alerts-briefing",
    {
      pattern: "30 1 * * *", // 01:30 UTC = 07:00 IST
    },
    {
      name: "daily-alerts-briefing",
      data: {
        trigger: "cron",
        enqueuedAt: new Date().toISOString(),
      },
    },
  );
}
