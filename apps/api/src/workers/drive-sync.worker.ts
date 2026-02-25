import crypto from "crypto";
import { Worker, Job } from "bullmq";
import { google } from "googleapis";
import { getRedis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { decrypt } from "../lib/auth";
import type { SyncJobData } from "../queues/sync.queue";

// MIME types that are worth indexing for a CA firm
const INDEXABLE_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/csv",
  // Google Workspace native formats (exported as text/pdf for extraction later)
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.document",
]);

// ─── Processor ───────────────────────────────────────────────────

async function processDriveSync(job: Job<SyncJobData>): Promise<void> {
  const { userId, firmId, syncJobId } = job.data;

  // 1. Mark the DB sync job as running
  await prisma.syncJob.update({
    where: { id: syncJobId },
    data: { status: "running", startedAt: new Date() },
  });

  try {
    // 2. Load user + decrypt their Google refresh token
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.googleRefreshTokenEnc) {
      throw new Error(
        "User has no Google refresh token — they must sign in via Google OAuth first.",
      );
    }

    const refreshToken = decrypt(user.googleRefreshTokenEnc.toString());

    // 3. Build OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    // 4. List Drive files — only the types relevant to a CA firm
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Build a MIME type query — Drive API supports: mimeType='...' OR mimeType='...'
    const mimeQuery = [...INDEXABLE_MIME_TYPES]
      .map((m) => `mimeType='${m}'`)
      .join(" or ");

    const listRes = await drive.files.list({
      pageSize: 200,
      q: `(${mimeQuery}) and trashed=false`,
      fields: "files(id,name,mimeType,modifiedTime,size,parents),nextPageToken",
      orderBy: "modifiedTime desc",
    });

    const files = listRes.data.files ?? [];
    const documentsFound = files.length;

    await prisma.syncJob.update({
      where: { id: syncJobId },
      data: { documentsFound },
    });
    await job.updateProgress(10);

    console.log(
      `[Drive Sync] Job ${job.id}: found ${documentsFound} files for firm ${firmId}`,
    );

    // 5. Upsert a Document record for each file
    let documentsProcessed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.id || !file.name) continue;

      // Dedup: skip files already stored
      const existing = await prisma.document.findFirst({
        where: { firmId, sourceId: file.id },
        select: { id: true },
      });
      if (existing) {
        documentsProcessed++;
        continue;
      }

      const mimeType = file.mimeType ?? "application/octet-stream";
      const sourceDate = file.modifiedTime
        ? new Date(file.modifiedTime)
        : new Date();

      // Placeholder textHash — SHA-256 of fileId.
      // Updated to SHA-256 of actual text content in the chunking phase.
      const textHash = crypto
        .createHash("sha256")
        .update(file.id)
        .digest("hex");

      await prisma.document.create({
        data: {
          firmId,
          userId,
          source: "drive",
          sourceId: file.id,
          filename: file.name.slice(0, 499),
          mimeType,
          // Synthetic S3 key — actual upload happens in the text-extraction phase
          s3Key: `drive/files/${firmId}/${file.id}`,
          textHash,
          textExcerpt: null,
          status: "pending",
          sourceDate,
        },
      });

      documentsProcessed++;

      // Flush progress every 20 documents
      if (documentsProcessed % 20 === 0) {
        await prisma.syncJob.update({
          where: { id: syncJobId },
          data: { documentsProcessed },
        });
        const pct = Math.round(
          10 + (documentsProcessed / Math.max(documentsFound, 1)) * 85,
        );
        await job.updateProgress(pct);
      }
    }

    // 6. Finalise
    await prisma.syncJob.update({
      where: { id: syncJobId },
      data: {
        status: "completed",
        documentsFound,
        documentsProcessed,
        completedAt: new Date(),
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { lastSyncAt: new Date() },
    });

    await job.updateProgress(100);
    console.log(
      `[Drive Sync] Job ${job.id}: completed — ${documentsProcessed}/${documentsFound} documents created`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Drive Sync] Job ${job.id} failed:`, message);

    await prisma.syncJob
      .update({
        where: { id: syncJobId },
        data: { status: "failed", errorMessage: message },
      })
      .catch(() => {});

    throw err;
  }
}

// ─── Worker Factory ──────────────────────────────────────────────

/**
 * Start the Drive sync BullMQ worker.
 * Call once on server boot — runs concurrently with the HTTP server.
 */
export function startDriveSyncWorker(): Worker {
  const worker = new Worker<SyncJobData>("drive-sync", processDriveSync, {
    connection: getRedis(),
    concurrency: 2,
  });

  worker.on("completed", (job) => {
    console.log(`[Drive Sync] Worker: job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[Drive Sync] Worker: job ${job?.id} failed — ${err.message}`,
    );
  });

  console.log("[Drive Sync] Worker started (concurrency: 2)");
  return worker;
}
