/**
 * Daily scheduler BullMQ worker.
 *
 * Processes the daily-scheduler cron job:
 *   1. Runs alert detection for ALL firms
 *   2. Generates daily briefing for each active firm
 *
 * Concurrency: 1 (only one daily job at a time)
 */

import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { getRedis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { detectAlertsForAllFirms } from "../lib/alert-detector";
import { generateDailyBriefing, pushBriefingToWhatsApp } from "../lib/briefing-generator";
import { logger } from "../lib/logger";
import type { SchedulerJobData } from "../queues/scheduler.queue";
import { registerDailySchedule } from "../queues/scheduler.queue";

// ─── Processor ───────────────────────────────────────────────────

async function processSchedulerJob(job: Job<SchedulerJobData>): Promise<void> {
  const startMs = Date.now();
  logger.info("Daily scheduler started", {
    jobId: job.id,
    trigger: job.data.trigger,
  });

  // 1. Detect alerts for all firms
  logger.info("Running alert detection for all firms");
  await detectAlertsForAllFirms();

  // 2. Generate briefings for each active firm
  const firms = await prisma.firm.findMany({
    select: { id: true, name: true },
  });

  let briefingSuccessCount = 0;
  let briefingErrorCount = 0;

  for (const firm of firms) {
    try {
      const briefing = await generateDailyBriefing(firm.id);
      await pushBriefingToWhatsApp(firm.id, briefing.summary);
      briefingSuccessCount++;
    } catch (err) {
      briefingErrorCount++;
      logger.error(`Daily briefing failed for firm ${firm.id}`, {
        firmId: firm.id,
        firmName: firm.name,
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue to next firm — don't let one failure block all
    }
  }

  const durationMs = Date.now() - startMs;
  logger.info("Daily scheduler completed", {
    jobId: job.id,
    firmCount: firms.length,
    briefingSuccessCount,
    briefingErrorCount,
    durationMs,
  });
}

// ─── Worker bootstrap ────────────────────────────────────────────

let _worker: Worker<SchedulerJobData> | null = null;

export function startSchedulerWorker(): void {
  if (_worker) return;

  _worker = new Worker<SchedulerJobData>("daily-scheduler", processSchedulerJob, {
    connection: getRedis(),
    concurrency: 1,
  });

  _worker.on("completed", (job) => {
    logger.info(`[Scheduler] Job ${job?.id} completed`);
  });

  _worker.on("failed", (job, err) => {
    logger.error(`[Scheduler] Job ${job?.id} failed: ${err.message}`);
  });

  // Register the repeatable cron job
  registerDailySchedule()
    .then(() => {
      logger.info("[Scheduler] Daily cron registered (01:30 UTC / 07:00 IST)");
    })
    .catch((err) => {
      logger.error("[Scheduler] Failed to register cron:", err);
    });

  console.log("📅 Scheduler worker started — daily alerts + briefings");
}
