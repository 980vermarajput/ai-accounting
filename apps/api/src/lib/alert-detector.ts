/**
 * Alert Detection Service — scans existing data to generate alerts.
 *
 * Callable on-demand or from the daily BullMQ scheduler.
 *
 * Detection rules:
 * 1. INVOICE_OVERDUE       — invoice-pattern document with no follow-up in 45 days
 * 2. CLIENT_SILENT         — no documents from client in 30/60 days
 * 3. DEADLINE_DETECTED     — TODO (Sprint 2)
 * 4. HIGH_RISK_LANGUAGE    — risky keywords in recent chunks
 * 5. GST_FILING_DUE        — GSTR-1 (11th) / GSTR-3B (20th) within 3 days
 * 6. TDS_PAYMENT_DUE       — TDS deposit due by 7th (or 30 Apr for March quarter)
 * 7. ITR_FILING_DUE        — ITR deadline approaching (31 Jul / 31 Oct)
 * 8. MISSING_DOCUMENTS     — compliance deadline exists but no recent docs synced
 * 9. DOCUMENT_EXPIRY       — extracted deadline of expiry type is approaching
 *
 * Dedup: skip if identical (firmId + clientId + type) unread alert exists within 24 hours.
 *
 * Telegram notifications: HIGH and CRITICAL alerts are pushed to users with
 * Telegram linked and alertsEnabled = true.
 */

import type { AlertType, Severity } from "@prisma/client";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { sendMessage, escapeHtml } from "./telegram";

// ─── Types ───────────────────────────────────────────

export interface AlertDetectionResult {
  generated: number;
  skipped: number;
  errors: string[];
}

// ─── Constants ───────────────────────────────────────

const HIGH_RISK_KEYWORDS = [
  "legal action",
  "dispute",
  "not received",
  "reminder",
  "overdue",
  "escalate",
  "complaint",
  "dissatisfied",
  "withdraw",
];

const INVOICE_FILENAME_PATTERNS = [
  "%invoice%",
  "%inv-%",
  "%inv_%",
  "%billing%",
  "%bill%",
];

// ─── Deduplication ───────────────────────────────────

async function isDuplicate(
  firmId: string,
  clientId: string | null,
  type: AlertType,
): Promise<boolean> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const existing = await prisma.alert.findFirst({
    where: {
      firmId,
      clientId: clientId ?? undefined,
      type,
      isRead: false,
      createdAt: { gt: twentyFourHoursAgo },
    },
  });

  return existing !== null;
}

// ─── Telegram Push Notifications ─────────────────────

const SEVERITY_EMOJI: Record<Severity, string> = {
  CRITICAL: "🚨",
  HIGH: "⚠️",
  MEDIUM: "📢",
  LOW: "ℹ️",
};

/**
 * Send Telegram notifications for HIGH and CRITICAL alerts to firm users
 * who have Telegram linked with alertsEnabled = true.
 */
async function pushAlertToTelegram(
  firmId: string,
  alert: {
    type: AlertType;
    severity: Severity;
    title: string;
    body: string | null;
  },
): Promise<{ sent: number; failed: number }> {
  // Only push HIGH and CRITICAL alerts
  if (alert.severity !== "HIGH" && alert.severity !== "CRITICAL") {
    return { sent: 0, failed: 0 };
  }

  // Skip if Telegram bot is not configured
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return { sent: 0, failed: 0 };
  }

  try {
    // Find all users in this firm with Telegram linked and alerts enabled
    const telegramLinks = await prisma.telegramLink.findMany({
      where: {
        firmId,
        alertsEnabled: true,
      },
      select: {
        telegramChatId: true,
        user: {
          select: { name: true },
        },
      },
    });

    if (telegramLinks.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const emoji = SEVERITY_EMOJI[alert.severity];
    const message = [
      `${emoji} <b>${alert.severity} Alert</b>`,
      "",
      `<b>${escapeHtml(alert.title)}</b>`,
      "",
      alert.body ? escapeHtml(alert.body) : "",
      "",
      `<i>Type: ${alert.type.replace(/_/g, " ")}</i>`,
    ].join("\n");

    let sent = 0;
    let failed = 0;

    for (const link of telegramLinks) {
      try {
        await sendMessage(Number(link.telegramChatId), message, {
          parseMode: "HTML",
        });
        sent++;
        logger.debug("Telegram alert sent", {
          firmId,
          chatId: link.telegramChatId.toString(),
          alertType: alert.type,
        });
      } catch (err) {
        failed++;
        logger.warn("Failed to send Telegram alert", {
          firmId,
          chatId: link.telegramChatId.toString(),
          error: (err as Error).message,
        });
      }
    }

    if (sent > 0) {
      logger.info("Telegram alerts pushed", {
        firmId,
        alertType: alert.type,
        severity: alert.severity,
        sent,
        failed,
      });
    }

    return { sent, failed };
  } catch (err) {
    logger.error("Failed to push Telegram alerts", {
      firmId,
      error: (err as Error).message,
    });
    return { sent: 0, failed: 0 };
  }
}

// ─── Rule 1: INVOICE_OVERDUE ─────────────────────────

async function detectInvoiceOverdue(firmId: string): Promise<AlertDetectionResult> {
  const result: AlertDetectionResult = { generated: 0, skipped: 0, errors: [] };

  try {
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Find clients that have invoice-pattern documents older than 45 days
    const clients = await prisma.client.findMany({
      where: { firmId },
      select: { id: true, name: true },
    });

    for (const client of clients) {
      try {
        // Check for invoice documents older than 45 days
        const invoiceDocs = await prisma.document.findMany({
          where: {
            firmId,
            clientId: client.id,
            source: { in: ["gmail", "upload"] },
            createdAt: { lt: fortyFiveDaysAgo },
            OR: INVOICE_FILENAME_PATTERNS.map((pattern) => ({
              filename: {
                contains: pattern.replace(/%/g, ""),
                mode: "insensitive" as const,
              },
            })),
          },
          select: { id: true, filename: true, createdAt: true },
          take: 1,
        });

        if (invoiceDocs.length === 0) continue;

        // Check if there has been any recent follow-up document for this client
        const recentDoc = await prisma.document.findFirst({
          where: {
            firmId,
            clientId: client.id,
            createdAt: { gt: fourteenDaysAgo },
          },
        });

        if (recentDoc) continue; // There's recent activity, no alert needed

        // Dedup check
        if (await isDuplicate(firmId, client.id, "INVOICE_OVERDUE")) {
          result.skipped++;
          continue;
        }

        await prisma.alert.create({
          data: {
            firmId,
            clientId: client.id,
            type: "INVOICE_OVERDUE",
            severity: "HIGH",
            title: `Invoice overdue — ${client.name}`,
            body: `Client "${client.name}" has an invoice (${invoiceDocs[0].filename}) with no follow-up activity in the last 45 days. Consider sending a reminder.`,
            metadata: {
              documentId: invoiceDocs[0].id,
              filename: invoiceDocs[0].filename,
              invoiceDate: invoiceDocs[0].createdAt.toISOString(),
            },
          },
        });

        // Push to Telegram (non-blocking, errors logged but don't affect result)
        await pushAlertToTelegram(firmId, {
          type: "INVOICE_OVERDUE",
          severity: "HIGH",
          title: `Invoice overdue — ${client.name}`,
          body: `Client "${client.name}" has an invoice (${invoiceDocs[0].filename}) with no follow-up activity in the last 45 days. Consider sending a reminder.`,
        });

        result.generated++;
      } catch (err) {
        result.errors.push(
          `INVOICE_OVERDUE client ${client.id}: ${(err as Error).message}`,
        );
      }
    }
  } catch (err) {
    result.errors.push(`INVOICE_OVERDUE: ${(err as Error).message}`);
  }

  return result;
}

// ─── Rule 2: CLIENT_SILENT ──────────────────────────

async function detectClientSilent(firmId: string): Promise<AlertDetectionResult> {
  const result: AlertDetectionResult = { generated: 0, skipped: 0, errors: [] };

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // Get all clients with at least one document (exclude clients with no docs — not yet engaged)
    const clientsWithDocs = await prisma.client.findMany({
      where: {
        firmId,
        documents: { some: {} },
      },
      select: {
        id: true,
        name: true,
        documents: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    for (const client of clientsWithDocs) {
      try {
        const lastDocDate = client.documents[0]?.createdAt;
        if (!lastDocDate) continue;

        let severity: Severity | null = null;

        if (lastDocDate < sixtyDaysAgo) {
          severity = "HIGH";
        } else if (lastDocDate < thirtyDaysAgo) {
          severity = "MEDIUM";
        }

        if (!severity) continue;

        // Dedup check
        if (await isDuplicate(firmId, client.id, "CLIENT_SILENT")) {
          result.skipped++;
          continue;
        }

        const daysSince = Math.floor(
          (Date.now() - lastDocDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        await prisma.alert.create({
          data: {
            firmId,
            clientId: client.id,
            type: "CLIENT_SILENT",
            severity,
            title: `No activity from ${client.name} in ${daysSince} days`,
            body: `Client "${client.name}" hasn't had any document activity in ${daysSince} days. Last document was on ${lastDocDate.toLocaleDateString("en-IN")}.`,
            metadata: {
              daysSinceLastDocument: daysSince,
              lastDocumentDate: lastDocDate.toISOString(),
            },
          },
        });

        // Push to Telegram (only HIGH/CRITICAL, non-blocking)
        await pushAlertToTelegram(firmId, {
          type: "CLIENT_SILENT",
          severity,
          title: `No activity from ${client.name} in ${daysSince} days`,
          body: `Client "${client.name}" hasn't had any document activity in ${daysSince} days. Last document was on ${lastDocDate.toLocaleDateString("en-IN")}.`,
        });

        result.generated++;
      } catch (err) {
        result.errors.push(
          `CLIENT_SILENT client ${client.id}: ${(err as Error).message}`,
        );
      }
    }
  } catch (err) {
    result.errors.push(`CLIENT_SILENT: ${(err as Error).message}`);
  }

  return result;
}

// ─── Rule 3: DEADLINE_DETECTED (Sprint 2 stub) ──────

// TODO: Implement in Sprint 2 — deadline-extractor.ts

// ─── Rule 4: HIGH_RISK_LANGUAGE ─────────────────────

async function detectHighRiskLanguage(firmId: string): Promise<AlertDetectionResult> {
  const result: AlertDetectionResult = { generated: 0, skipped: 0, errors: [] };

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Search chunks from recent documents that contain high-risk keywords
    for (const keyword of HIGH_RISK_KEYWORDS) {
      try {
        const matchingChunks = await prisma.chunk.findMany({
          where: {
            firmId,
            chunkText: { contains: keyword, mode: "insensitive" },
            document: {
              createdAt: { gt: sevenDaysAgo },
            },
          },
          select: {
            id: true,
            chunkText: true,
            clientId: true,
            document: {
              select: {
                id: true,
                filename: true,
                clientId: true,
                client: { select: { id: true, name: true } },
              },
            },
          },
          take: 5, // limit matches per keyword
        });

        for (const chunk of matchingChunks) {
          const clientId = chunk.document.clientId;
          const clientName = chunk.document.client?.name ?? "Unknown client";

          // Dedup check
          if (await isDuplicate(firmId, clientId, "HIGH_RISK_LANGUAGE")) {
            result.skipped++;
            continue;
          }

          // Extract snippet around keyword
          const idx = chunk.chunkText.toLowerCase().indexOf(keyword.toLowerCase());
          const start = Math.max(0, idx - 80);
          const end = Math.min(chunk.chunkText.length, idx + keyword.length + 80);
          const snippet = chunk.chunkText.slice(start, end);

          await prisma.alert.create({
            data: {
              firmId,
              clientId,
              type: "HIGH_RISK_LANGUAGE",
              severity: "HIGH",
              title: `Risk language detected — "${keyword}" in ${clientName} document`,
              body: `Found "${keyword}" in document "${chunk.document.filename}": "…${snippet}…"`,
              metadata: {
                keyword,
                documentId: chunk.document.id,
                filename: chunk.document.filename,
                snippet,
              },
            },
          });

          // Push to Telegram (non-blocking)
          await pushAlertToTelegram(firmId, {
            type: "HIGH_RISK_LANGUAGE",
            severity: "HIGH",
            title: `Risk language detected — "${keyword}" in ${clientName} document`,
            body: `Found "${keyword}" in document "${chunk.document.filename}": "…${snippet}…"`,
          });

          result.generated++;
        }
      } catch (err) {
        result.errors.push(
          `HIGH_RISK_LANGUAGE keyword "${keyword}": ${(err as Error).message}`,
        );
      }
    }
  } catch (err) {
    result.errors.push(`HIGH_RISK_LANGUAGE: ${(err as Error).message}`);
  }

  return result;
}

// ─── Rule 5: GST_FILING_DUE ─────────────────────────

// Indian GST filing deadlines (fixed monthly):
// GSTR-1: 11th of next month
// GSTR-3B: 20th of next month
const GST_DEADLINES = [
  { name: "GSTR-1", dayOfMonth: 11 },
  { name: "GSTR-3B", dayOfMonth: 20 },
];

async function detectGstFilingDue(firmId: string): Promise<AlertDetectionResult> {
  const result: AlertDetectionResult = { generated: 0, skipped: 0, errors: [] };

  try {
    const today = new Date();
    const clients = await prisma.client.findMany({
      where: { firmId },
      select: { id: true, name: true },
    });

    for (const gst of GST_DEADLINES) {
      try {
        // Calculate next upcoming deadline for this GST return
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        // Deadline is gst.dayOfMonth of current month (for prev month's filing)
        const deadlineThisMonth = new Date(currentYear, currentMonth, gst.dayOfMonth);
        const deadlineNextMonth = new Date(currentYear, currentMonth + 1, gst.dayOfMonth);

        // Pick whichever deadline is upcoming (within 5 days)
        const upcoming =
          deadlineThisMonth >= today ? deadlineThisMonth : deadlineNextMonth;
        const daysUntil = Math.ceil(
          (upcoming.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (daysUntil > 5) continue; // Not urgent yet

        const severity: Severity = daysUntil <= 2 ? "CRITICAL" : "HIGH";
        const deadlineStr = upcoming.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });

        // Create one alert per firm (not per client) to avoid spamming
        if (await isDuplicate(firmId, null, "GST_FILING_DUE")) {
          result.skipped++;
          continue;
        }

        const alert = await prisma.alert.create({
          data: {
            firmId,
            type: "GST_FILING_DUE",
            severity,
            title: `${gst.name} filing due in ${daysUntil} day${daysUntil === 1 ? "" : "s"} — ${deadlineStr}`,
            body: `${gst.name} (${clients.length} client${clients.length === 1 ? "" : "s"}) is due on ${deadlineStr}. Ensure all sales/purchase registers are ready for filing.`,
            metadata: {
              gstReturnType: gst.name,
              deadlineDate: upcoming.toISOString(),
              daysUntil,
              clientCount: clients.length,
            },
          },
        });

        await pushAlertToTelegram(firmId, {
          type: "GST_FILING_DUE",
          severity,
          title: alert.title,
          body: alert.body,
        });

        result.generated++;
      } catch (err) {
        result.errors.push(`GST_FILING_DUE ${gst.name}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    result.errors.push(`GST_FILING_DUE: ${(err as Error).message}`);
  }

  return result;
}

// ─── Rule 6: TDS_PAYMENT_DUE ────────────────────────

// TDS deposit deadline:
// Regular months: 7th of next month
// March quarter: 30th April

async function detectTdsPaymentDue(firmId: string): Promise<AlertDetectionResult> {
  const result: AlertDetectionResult = { generated: 0, skipped: 0, errors: [] };

  try {
    const today = new Date();
    const currentMonth = today.getMonth(); // 0-indexed
    const currentYear = today.getFullYear();

    // March (month 2) quarter TDS is due 30 April
    // All other months TDS is due 7th of next month
    let tdsDeadline: Date;
    let periodLabel: string;

    if (currentMonth === 2) {
      // March — due 30 April
      tdsDeadline = new Date(currentYear, 3, 30); // April 30
      periodLabel = "March quarter (Q4)";
    } else {
      // Regular month — due 7th of next month
      tdsDeadline = new Date(currentYear, currentMonth + 1, 7);
      const monthName = today.toLocaleString("en-IN", { month: "long" });
      periodLabel = monthName;
    }

    const daysUntil = Math.ceil(
      (tdsDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysUntil > 7) return result; // Not urgent yet

    const severity: Severity = daysUntil <= 2 ? "CRITICAL" : "HIGH";
    const deadlineStr = tdsDeadline.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    if (await isDuplicate(firmId, null, "TDS_PAYMENT_DUE")) {
      result.skipped++;
      return result;
    }

    // Check how many clients have TDS-related documents
    const tdsClientCount = await prisma.document.groupBy({
      by: ["clientId"],
      where: {
        firmId,
        OR: [
          { filename: { contains: "tds", mode: "insensitive" } },
          { filename: { contains: "26q", mode: "insensitive" } },
          { filename: { contains: "salary", mode: "insensitive" } },
        ],
        createdAt: { gte: new Date(currentYear, currentMonth - 1, 1) },
      },
    });

    const alert = await prisma.alert.create({
      data: {
        firmId,
        type: "TDS_PAYMENT_DUE",
        severity,
        title: `TDS deposit due in ${daysUntil} day${daysUntil === 1 ? "" : "s"} — ${deadlineStr}`,
        body: `TDS for ${periodLabel} must be deposited by ${deadlineStr}. ${tdsClientCount.length > 0 ? `${tdsClientCount.length} client(s) have TDS-related documents this period.` : "Review all clients for TDS deductions."} Late deposit attracts 1.5%/month interest.`,
        metadata: {
          periodLabel,
          deadlineDate: tdsDeadline.toISOString(),
          daysUntil,
          tdsClientCount: tdsClientCount.length,
        },
      },
    });

    await pushAlertToTelegram(firmId, {
      type: "TDS_PAYMENT_DUE",
      severity,
      title: alert.title,
      body: alert.body,
    });

    result.generated++;
  } catch (err) {
    result.errors.push(`TDS_PAYMENT_DUE: ${(err as Error).message}`);
  }

  return result;
}

// ─── Rule 7: ITR_FILING_DUE ─────────────────────────

// Income Tax Return deadlines:
// Non-audit cases:  31 July
// Audit cases:      31 October
// Belated return:   31 December

const ITR_DEADLINES = [
  { label: "ITR (non-audit)", month: 6, day: 31 }, // 31 July (month 6 = July)
  { label: "ITR (audit cases)", month: 9, day: 31 }, // 31 October (month 9 = October)
];

async function detectItrFilingDue(firmId: string): Promise<AlertDetectionResult> {
  const result: AlertDetectionResult = { generated: 0, skipped: 0, errors: [] };

  try {
    const today = new Date();

    for (const itr of ITR_DEADLINES) {
      try {
        const deadline = new Date(today.getFullYear(), itr.month, itr.day);

        // Only alert if deadline is this year and within 14 days
        if (deadline < today) continue; // Already passed this year

        const daysUntil = Math.ceil(
          (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (daysUntil > 14) continue; // Not urgent yet

        const severity: Severity = daysUntil <= 3 ? "CRITICAL" : "HIGH";
        const deadlineStr = deadline.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });

        if (await isDuplicate(firmId, null, "ITR_FILING_DUE")) {
          result.skipped++;
          continue;
        }

        const clientCount = await prisma.client.count({ where: { firmId } });

        const alert = await prisma.alert.create({
          data: {
            firmId,
            type: "ITR_FILING_DUE",
            severity,
            title: `${itr.label} deadline in ${daysUntil} day${daysUntil === 1 ? "" : "s"} — ${deadlineStr}`,
            body: `${itr.label} is due on ${deadlineStr} for ${clientCount} client${clientCount === 1 ? "" : "s"}. Missing the deadline attracts ₹5,000 penalty under Section 234F. Ensure all returns are filed on time.`,
            metadata: {
              itrType: itr.label,
              deadlineDate: deadline.toISOString(),
              daysUntil,
              clientCount,
            },
          },
        });

        await pushAlertToTelegram(firmId, {
          type: "ITR_FILING_DUE",
          severity,
          title: alert.title,
          body: alert.body,
        });

        result.generated++;
      } catch (err) {
        result.errors.push(`ITR_FILING_DUE ${itr.label}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    result.errors.push(`ITR_FILING_DUE: ${(err as Error).message}`);
  }

  return result;
}

// ─── Rule 8: MISSING_DOCUMENTS ──────────────────────

// Fires when an extracted deadline is approaching for a client but
// that client has had NO documents synced in the past 21 days.
// Indicates the CA may not have data needed to file.

async function detectMissingDocuments(firmId: string): Promise<AlertDetectionResult> {
  const result: AlertDetectionResult = { generated: 0, skipped: 0, errors: [] };

  try {
    const today = new Date();
    const fourteenDaysFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const twentyOneDaysAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);

    // Find deadlines approaching in the next 14 days that belong to specific clients
    const upcomingDeadlines = await prisma.extractedDeadline.findMany({
      where: {
        firmId,
        clientId: { not: null },
        date: { gte: today, lte: fourteenDaysFromNow },
      },
      select: {
        clientId: true,
        date: true,
        description: true,
        client: { select: { id: true, name: true } },
      },
      distinct: ["clientId"],
    });

    for (const deadline of upcomingDeadlines) {
      try {
        if (!deadline.clientId || !deadline.client) continue;

        // Check if client has any recent documents
        const recentDoc = await prisma.document.findFirst({
          where: {
            firmId,
            clientId: deadline.clientId,
            createdAt: { gte: twentyOneDaysAgo },
          },
        });

        if (recentDoc) continue; // Documents are fresh — no alert needed

        if (await isDuplicate(firmId, deadline.clientId, "MISSING_DOCUMENTS")) {
          result.skipped++;
          continue;
        }

        const daysUntil = Math.ceil(
          (deadline.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        const deadlineStr = deadline.date.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });

        const alert = await prisma.alert.create({
          data: {
            firmId,
            clientId: deadline.clientId,
            type: "MISSING_DOCUMENTS",
            severity: "HIGH",
            title: `No recent documents for ${deadline.client.name} — deadline in ${daysUntil} days`,
            body: `${deadline.client.name} has a deadline on ${deadlineStr} (${deadline.description}) but no documents have been synced in the last 21 days. Request documents immediately to avoid a last-minute crunch.`,
            metadata: {
              clientName: deadline.client.name,
              deadlineDate: deadline.date.toISOString(),
              deadlineDescription: deadline.description,
              daysUntil,
              lastDocDaysAgo: 21,
            },
          },
        });

        await pushAlertToTelegram(firmId, {
          type: "MISSING_DOCUMENTS",
          severity: "HIGH",
          title: alert.title,
          body: alert.body,
        });

        result.generated++;
      } catch (err) {
        result.errors.push(
          `MISSING_DOCUMENTS client ${deadline.clientId}: ${(err as Error).message}`,
        );
      }
    }
  } catch (err) {
    result.errors.push(`MISSING_DOCUMENTS: ${(err as Error).message}`);
  }

  return result;
}

// ─── Rule 9: DOCUMENT_EXPIRY ─────────────────────────

// Detects extracted deadlines that represent expiry-type events
// (DSC, license, registration, certificate, PAN, Aadhaar linkage etc.)
// approaching within 30 days.

const EXPIRY_KEYWORDS = [
  "expir",
  "renewal",
  "renew",
  "valid till",
  "valid until",
  "expire",
  "dsc",
  "digital signature",
  "license",
  "licence",
  "registration",
  "certificate",
  "pan linking",
  "aadhaar link",
];

async function detectDocumentExpiry(firmId: string): Promise<AlertDetectionResult> {
  const result: AlertDetectionResult = { generated: 0, skipped: 0, errors: [] };

  try {
    const today = new Date();
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Find extracted deadlines that match expiry keywords and are approaching
    const expiryDeadlines = await prisma.extractedDeadline.findMany({
      where: {
        firmId,
        date: { gte: today, lte: thirtyDaysFromNow },
        OR: EXPIRY_KEYWORDS.map((kw) => ({
          description: { contains: kw, mode: "insensitive" as const },
        })),
      },
      select: {
        id: true,
        clientId: true,
        date: true,
        description: true,
        client: { select: { id: true, name: true } },
        document: { select: { filename: true } },
      },
    });

    for (const deadline of expiryDeadlines) {
      try {
        if (await isDuplicate(firmId, deadline.clientId ?? null, "DOCUMENT_EXPIRY")) {
          result.skipped++;
          continue;
        }

        const daysUntil = Math.ceil(
          (deadline.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        const severity: Severity = daysUntil <= 7 ? "HIGH" : "MEDIUM";
        const clientLabel = deadline.client?.name ?? "Unknown client";
        const deadlineStr = deadline.date.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });

        const alert = await prisma.alert.create({
          data: {
            firmId,
            clientId: deadline.clientId ?? null,
            type: "DOCUMENT_EXPIRY",
            severity,
            title: `Expiry approaching — ${deadline.description} (${clientLabel}) in ${daysUntil} days`,
            body: `${deadline.description} for ${clientLabel} expires on ${deadlineStr}. Found in document: "${deadline.document.filename}". Initiate renewal process immediately.`,
            metadata: {
              clientName: clientLabel,
              deadlineId: deadline.id,
              deadlineDate: deadline.date.toISOString(),
              description: deadline.description,
              documentFilename: deadline.document.filename,
              daysUntil,
            },
          },
        });

        await pushAlertToTelegram(firmId, {
          type: "DOCUMENT_EXPIRY",
          severity,
          title: alert.title,
          body: alert.body,
        });

        result.generated++;
      } catch (err) {
        result.errors.push(
          `DOCUMENT_EXPIRY deadline ${deadline.id}: ${(err as Error).message}`,
        );
      }
    }
  } catch (err) {
    result.errors.push(`DOCUMENT_EXPIRY: ${(err as Error).message}`);
  }

  return result;
}

// ─── Public API ──────────────────────────────────────

/**
 * Run all alert detection rules for a single firm.
 */
export async function detectAlertsForFirm(firmId: string): Promise<AlertDetectionResult> {
  const combined: AlertDetectionResult = { generated: 0, skipped: 0, errors: [] };

  const rules = [
    detectInvoiceOverdue(firmId),
    detectClientSilent(firmId),
    detectHighRiskLanguage(firmId),
    detectGstFilingDue(firmId),
    detectTdsPaymentDue(firmId),
    detectItrFilingDue(firmId),
    detectMissingDocuments(firmId),
    detectDocumentExpiry(firmId),
  ];

  const results = await Promise.allSettled(rules);

  for (const r of results) {
    if (r.status === "fulfilled") {
      combined.generated += r.value.generated;
      combined.skipped += r.value.skipped;
      combined.errors.push(...r.value.errors);
    } else {
      combined.errors.push(r.reason?.message ?? "Unknown rule error");
    }
  }

  logger.info("Alert detection complete for firm", {
    firmId,
    operation: "alert_detection",
    generated: combined.generated,
    skipped: combined.skipped,
    errorCount: combined.errors.length,
  });

  return combined;
}

/**
 * Run alert detection for all active firms (called by scheduler).
 */
export async function detectAlertsForAllFirms(): Promise<void> {
  const firms = await prisma.firm.findMany({
    select: { id: true, name: true },
  });

  logger.info(`Starting alert detection for ${firms.length} firms`, {
    operation: "alert_detection_all",
  });

  for (const firm of firms) {
    try {
      const result = await detectAlertsForFirm(firm.id);
      logger.info(
        `Alert detection for "${firm.name}": ${result.generated} generated, ${result.skipped} skipped`,
        {
          firmId: firm.id,
          operation: "alert_detection",
        },
      );
    } catch (err) {
      logger.error(`Alert detection failed for firm "${firm.name}"`, {
        firmId: firm.id,
        operation: "alert_detection",
        error: (err as Error).message,
      });
      // Continue with other firms — individual failures must not stop others
    }
  }
}
