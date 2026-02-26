import crypto from "crypto";
import { Worker, Job } from "bullmq";
import { google } from "googleapis";
import { getRedis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { decrypt } from "../lib/auth";
import { addExtractionJob } from "../queues/extraction.queue";
import type { SyncJobData } from "../queues/sync.queue";

// ─── Processor ───────────────────────────────────────────────────

async function processGmailSync(job: Job<SyncJobData>): Promise<void> {
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

    // googleRefreshTokenEnc is a Prisma Bytes field — returned as Uint8Array or Buffer.
    // Always wrap with Buffer.from() before calling .toString() so we get the
    // original UTF-8 base64 string, not a comma-separated decimal array.
    const refreshToken = decrypt(
      Buffer.from(user.googleRefreshTokenEnc).toString("utf8"),
    );

    // 3. Create Google OAuth2 client with the decrypted refresh token
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    // 4. Fetch Gmail message list
    //    We target messages with attachments — most relevant for Indian CA firms
    //    (invoices, GST returns, ITRs sent as PDFs/Excel)
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const maxResults = parseInt(process.env.SYNC_MAX_RESULTS ?? "25", 10);

    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      q: "has:attachment",
    });

    const messageRefs = listRes.data.messages ?? [];
    const documentsFound = messageRefs.length;

    await prisma.syncJob.update({
      where: { id: syncJobId },
      data: { documentsFound },
    });
    await job.updateProgress(10);

    console.log(
      `[Gmail Sync] Job ${job.id}: found ${documentsFound} messages for firm ${firmId}`,
    );

    // 5. Upsert a Document record for each message
    let documentsProcessed = 0;

    for (let i = 0; i < messageRefs.length; i++) {
      const msgRef = messageRefs[i];
      if (!msgRef.id) continue;

      // Dedup: skip messages we've already stored
      const existing = await prisma.document.findFirst({
        where: { firmId, sourceId: msgRef.id },
        select: { id: true },
      });
      if (existing) {
        documentsProcessed++;
        continue;
      }

      // Fetch message metadata only (no body download — efficient)
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: msgRef.id,
        format: "metadata",
        metadataHeaders: ["Subject", "Date"],
      });

      const headers = msgRes.data.payload?.headers ?? [];
      const subject =
        headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
      const dateHeader = headers.find((h) => h.name === "Date")?.value;
      const sourceDate = dateHeader ? new Date(dateHeader) : new Date();
      const snippet = msgRes.data.snippet ?? "";

      // Placeholder textHash — SHA-256 of the sourceId.
      // Will be updated to SHA-256 of actual extracted text in the chunking phase.
      const textHash = crypto
        .createHash("sha256")
        .update(msgRef.id)
        .digest("hex");

      const doc = await prisma.document.create({
        data: {
          firmId,
          userId,
          source: "gmail",
          sourceId: msgRef.id,
          filename: subject.slice(0, 499),
          mimeType: "message/rfc822",
          // Synthetic S3 key — actual upload happens in the text-extraction phase
          s3Key: `gmail/messages/${firmId}/${msgRef.id}`,
          textHash,
          textExcerpt: snippet.slice(0, 499),
          status: "pending",
          sourceDate,
        },
      });

      // Enqueue extraction job — worker will download full body, extract text, chunk
      await addExtractionJob({
        documentId: doc.id,
        userId,
        firmId,
        source: "gmail",
        sourceId: msgRef.id,
        mimeType: "message/rfc822",
      });

      documentsProcessed++;

      // Flush progress to DB + BullMQ every 20 documents
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

    // Update user's lastSyncAt
    await prisma.user.update({
      where: { id: userId },
      data: { lastSyncAt: new Date() },
    });

    await job.updateProgress(100);
    console.log(
      `[Gmail Sync] Job ${job.id}: completed — ${documentsProcessed}/${documentsFound} documents created`,
    );
  } catch (err) {
    // Mark the sync job as failed; re-throw so BullMQ can retry
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Gmail Sync] Job ${job.id} failed:`, message);

    await prisma.syncJob
      .update({
        where: { id: syncJobId },
        data: { status: "failed", errorMessage: message },
      })
      .catch(() => {}); // don't shadow the original error

    throw err;
  }
}

// ─── Worker Factory ──────────────────────────────────────────────

/**
 * Start the Gmail sync BullMQ worker.
 * Call once on server boot — it runs concurrently with the HTTP server.
 */
export function startGmailSyncWorker(): Worker {
  const worker = new Worker<SyncJobData>("gmail-sync", processGmailSync, {
    connection: getRedis(),
    concurrency: 2, // process up to 2 users' syncs in parallel
  });

  worker.on("completed", (job) => {
    console.log(`[Gmail Sync] Worker: job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[Gmail Sync] Worker: job ${job?.id} failed — ${err.message}`,
    );
  });

  console.log("[Gmail Sync] Worker started (concurrency: 2)");
  return worker;
}
