/**
 * Extraction BullMQ worker.
 *
 * Picks up jobs from the "extraction" queue and:
 *   1. Downloads raw content from Gmail (message body) or Drive (file media)
 *   2. Extracts plain text via `extractText()`
 *   3. Chunks the text via `chunkText()`
 *   4. Persists `Chunk` rows in the database
 *   5. Updates the parent `Document` status to "ready" (or "error" on failure)
 *
 * Gmail:  uses `messages.get({ format: "full" })` to get the message body.
 * Drive:  exports Google Workspace native files (Docs/Sheets) to OOXML first,
 *         then downloads binary files (PDF, DOCX, XLSX) as media streams.
 */

import { Worker, Job } from "bullmq";
import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import { getRedis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { decrypt } from "../lib/auth";
import { extractText } from "../lib/extractor";
import { chunkText } from "../lib/chunker";
import { addEmbeddingJob } from "../queues/embedding.queue";
import {
  generateDocumentSummary,
  rebuildFirmSnapshot,
} from "../lib/summarizer";
import type { ExtractionJobData } from "../queues/extraction.queue";

// ─── Gmail helpers ────────────────────────────────────────────────

/**
 * Recursively walk a Gmail message MIME tree and return the first non-empty
 * plain-text body found.  Falls back to HTML stripped of tags.
 */
function extractEmailBodyText(
  payload: gmail_v1.Schema$MessagePart | undefined,
): string {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts) {
    // Prefer text/plain
    const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart) return extractEmailBodyText(textPart);

    // Fall back to text/html — strip tags for a plain-text approximation
    const htmlPart = payload.parts.find((p) => p.mimeType === "text/html");
    if (htmlPart) {
      const html = extractEmailBodyText(htmlPart);
      return html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Recurse into multipart/mixed, multipart/related, etc.
    for (const part of payload.parts) {
      const text = extractEmailBodyText(part);
      if (text) return text;
    }
  }

  return "";
}

/**
 * Recursively collect all attachment parts (parts with a filename and an
 * attachmentId) from a Gmail message MIME tree.
 */
function collectAttachmentParts(
  payload: gmail_v1.Schema$MessagePart | undefined,
): Array<{ filename: string; mimeType: string; attachmentId: string }> {
  if (!payload) return [];
  const results: Array<{
    filename: string;
    mimeType: string;
    attachmentId: string;
  }> = [];

  if (payload.filename && payload.body?.attachmentId) {
    results.push({
      filename: payload.filename,
      mimeType: payload.mimeType ?? "application/octet-stream",
      attachmentId: payload.body.attachmentId,
    });
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      results.push(...collectAttachmentParts(part));
    }
  }

  return results;
}

// ─── Processor ───────────────────────────────────────────────────

async function processExtraction(job: Job<ExtractionJobData>): Promise<void> {
  const { documentId, userId, firmId, source, sourceId, mimeType } = job.data;

  // 1. Mark document as processing
  await prisma.document.update({
    where: { id: documentId },
    data: { status: "processing" },
  });

  try {
    // 2. Build Google OAuth2 client (needed for Gmail + Drive downloads)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.googleRefreshTokenEnc) {
      throw new Error(
        "User has no Google refresh token — they must sign in via Google OAuth first.",
      );
    }

    // googleRefreshTokenEnc is a Prisma Bytes field — returned as Uint8Array.
    // Buffer.from() is required before .toString() to recover the original UTF-8
    // base64 string; direct Uint8Array.toString() gives "70,43,111,..." instead.
    const refreshToken = decrypt(
      Buffer.from(user.googleRefreshTokenEnc).toString("utf8"),
    );

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    // 3. Download raw content
    let buffer: Buffer;
    let effectiveMimeType = mimeType;

    if (source === "gmail") {
      // ── Gmail ──────────────────────────────────────────────────
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: sourceId,
        format: "full",
      });

      // Start with the email body text + snippet
      const bodyText =
        extractEmailBodyText(msgRes.data.payload) +
        (msgRes.data.snippet ? `\n\n${msgRes.data.snippet}` : "");

      // Also extract text from any attachments (PDFs, CSVs, DOCX, XLSX, etc.)
      const attachmentParts = collectAttachmentParts(msgRes.data.payload);
      const attachmentTexts: string[] = [];

      for (const att of attachmentParts) {
        try {
          const attRes = await gmail.users.messages.attachments.get({
            userId: "me",
            messageId: sourceId,
            id: att.attachmentId,
          });

          if (attRes.data.data) {
            const attBuffer = Buffer.from(attRes.data.data, "base64url");
            const { text: attText } = await extractText(
              attBuffer,
              att.mimeType,
            );
            if (attText) {
              attachmentTexts.push(
                `\n\n--- Attachment: ${att.filename} ---\n${attText}`,
              );
              console.log(
                `[Extraction] Job ${job.id}: extracted ${attText.length} chars from attachment "${att.filename}"`,
              );
            }
          }
        } catch (attErr) {
          // Non-fatal — skip unreadable attachments but log the warning
          console.warn(
            `[Extraction] Job ${job.id}: could not extract attachment "${att.filename}":`,
            attErr instanceof Error ? attErr.message : attErr,
          );
        }
      }

      const combined = [bodyText, ...attachmentTexts].join("").trim();
      buffer = Buffer.from(combined || " ", "utf-8"); // space prevents empty-buffer edge case
      effectiveMimeType = "text/plain";
    } else if (source === "drive") {
      // ── Drive ──────────────────────────────────────────────────
      const drive = google.drive({ version: "v3", auth: oauth2Client });

      if (mimeType.startsWith("application/vnd.google-apps.")) {
        // Export Google Workspace native formats to OOXML
        const exportMime =
          mimeType === "application/vnd.google-apps.spreadsheet"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

        const exportRes = await drive.files.export(
          { fileId: sourceId, mimeType: exportMime },
          { responseType: "arraybuffer" },
        );
        buffer = Buffer.from(exportRes.data as ArrayBuffer);
        effectiveMimeType = exportMime;
      } else {
        // Download binary file (PDF, DOCX, XLSX, text, etc.)
        const mediaRes = await drive.files.get(
          { fileId: sourceId, alt: "media" },
          { responseType: "arraybuffer" },
        );
        buffer = Buffer.from(mediaRes.data as ArrayBuffer);
      }
    } else {
      // "upload" — content will be provided by the upload endpoint directly
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: "error",
          errorMessage: "Upload source extraction is not yet implemented.",
        },
      });
      return;
    }

    await job.updateProgress(40);

    // 4. Extract plain text from buffer
    const { text, textHash } = await extractText(buffer, effectiveMimeType);

    if (!text) {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: "error",
          errorMessage:
            "No text could be extracted from this document (unsupported format or empty file).",
        },
      });
      console.warn(
        `[Extraction] Job ${job.id}: no text for document ${documentId}`,
      );
      return;
    }

    await job.updateProgress(60);

    // 5. Dedup by textHash — skip if same content already indexed for this firm
    const duplicate = await prisma.document.findFirst({
      where: {
        firmId,
        textHash,
        id: { not: documentId },
      },
      select: { id: true },
    });

    if (duplicate) {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: "error",
          errorMessage: `Duplicate — identical content already indexed as document ${duplicate.id}`,
          textHash,
        },
      });
      console.log(
        `[Extraction] Job ${job.id}: duplicate content, skipping ${documentId}`,
      );
      return;
    }

    // 6. Chunk the text
    const chunks = chunkText(text);

    await job.updateProgress(75);

    // 7. Persist chunks (delete any stale chunks first, in case of retry)
    await prisma.chunk.deleteMany({ where: { documentId } });

    if (chunks.length > 0) {
      await prisma.chunk.createMany({
        data: chunks.map((c) => ({
          documentId,
          firmId,
          chunkIndex: c.chunkIndex,
          chunkText: c.chunkText,
          tokenCount: c.tokenCount,
          metadata: {
            source,
            sourceId,
            mimeType: effectiveMimeType,
          },
        })),
      });
    }

    // 8. Mark document as ready
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "ready",
        textHash,
        textExcerpt: text.slice(0, 499),
      },
    });

    // 9. Generate LLM summary + entities (non-blocking — failures don't affect status)
    try {
      // Fetch the filename for context (ExtractionJobData doesn't carry it)
      const docRecord = await prisma.document.findUnique({
        where: { id: documentId },
        select: { filename: true },
      });
      const filename = docRecord?.filename ?? "unknown";

      const summaryResult = await generateDocumentSummary(
        text,
        filename,
        effectiveMimeType,
      );
      if (summaryResult) {
        await prisma.document.update({
          where: { id: documentId },
          data: {
            summary: summaryResult.summary,
            entities:
              summaryResult.entities as unknown as import("@prisma/client").Prisma.InputJsonValue,
          },
        });
        console.log(
          `[Extraction] Job ${job.id}: summary generated for ${documentId}`,
        );

        // Rebuild firm knowledge snapshot with the new summary
        await rebuildFirmSnapshot(firmId).catch((err) => {
          console.warn(
            `[Extraction] Job ${job.id}: snapshot rebuild failed:`,
            err instanceof Error ? err.message : err,
          );
        });
      }
    } catch (summaryErr) {
      // Non-fatal — document is still ready, just without a summary
      console.warn(
        `[Extraction] Job ${job.id}: summary generation failed:`,
        summaryErr instanceof Error ? summaryErr.message : summaryErr,
      );
    }

    // 10. Kick off embedding pipeline
    if (chunks.length > 0) {
      await addEmbeddingJob({ documentId, firmId });
    }

    await job.updateProgress(100);
    console.log(
      `[Extraction] Job ${job.id}: document ${documentId} ready — ${chunks.length} chunk(s) stored, embedding queued`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Extraction] Job ${job.id} failed:`, message);

    await prisma.document
      .update({
        where: { id: documentId },
        data: { status: "error", errorMessage: message },
      })
      .catch(() => {}); // don't shadow the original error

    throw err;
  }
}

// ─── Worker Factory ──────────────────────────────────────────────

/**
 * Start the document extraction BullMQ worker.
 * Call once on server boot alongside the sync workers.
 */
export function startExtractionWorker(): Worker {
  const worker = new Worker<ExtractionJobData>(
    "extraction",
    processExtraction,
    {
      connection: getRedis(),
      concurrency: 3,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[Extraction] Worker: job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[Extraction] Worker: job ${job?.id} failed — ${err.message}`,
    );
  });

  console.log("[Extraction] Worker started (concurrency: 3)");
  return worker;
}
