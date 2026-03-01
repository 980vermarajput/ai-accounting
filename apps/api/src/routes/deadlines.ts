/**
 * Deadlines router — extracted compliance deadline endpoints.
 *
 * GET  /api/deadlines          — paginated deadline list with filters
 * GET  /api/deadlines/calendar — deadlines grouped by date for a month
 * GET  /api/deadlines/export   — ICS (iCalendar) export
 */

import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import type { Prisma } from "@prisma/client";
import type {
  ApiResponse,
  PaginatedResponse,
  ExtractedDeadline,
  DeadlineCalendarEntry,
} from "@ai-accounting/shared";
import {
  deadlineListQuerySchema,
  deadlineCalendarQuerySchema,
} from "@ai-accounting/shared";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limiter";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/api-error";

export const deadlinesRouter: Router = Router();

deadlinesRouter.use(requireAuth);
deadlinesRouter.use(rateLimit);

// ─── GET /api/deadlines ──────────────────────────────

deadlinesRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firmId } = req.user!;
    const query = deadlineListQuerySchema.parse(req.query);
    const { page, limit, clientId, from, to, confidence } = query;

    const where: Prisma.ExtractedDeadlineWhereInput = { firmId };

    if (clientId) where.clientId = clientId;
    if (confidence) where.confidence = confidence;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const [deadlines, total] = await Promise.all([
      prisma.extractedDeadline.findMany({
        where,
        orderBy: { date: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          document: { select: { id: true, filename: true } },
          client: { select: { id: true, name: true } },
        },
      }),
      prisma.extractedDeadline.count({ where }),
    ]);

    const response: PaginatedResponse<ExtractedDeadline> = {
      success: true,
      data: deadlines.map(mapDeadline),
      pagination: {
        page,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    res.json(response);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/deadlines/calendar ─────────────────────

deadlinesRouter.get(
  "/calendar",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.user!;
      const query = deadlineCalendarQuerySchema.parse(req.query);
      const { month, year, clientId } = query;

      // Build date range for the month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // last day of month

      const where: Prisma.ExtractedDeadlineWhereInput = {
        firmId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      };

      if (clientId) where.clientId = clientId;

      const deadlines = await prisma.extractedDeadline.findMany({
        where,
        orderBy: { date: "asc" },
        include: {
          document: { select: { id: true, filename: true } },
          client: { select: { id: true, name: true } },
        },
      });

      // Group by date (YYYY-MM-DD)
      const grouped = new Map<string, ExtractedDeadline[]>();
      for (const dl of deadlines) {
        const dateKey = dl.date.toISOString().split("T")[0];
        if (!grouped.has(dateKey)) grouped.set(dateKey, []);
        grouped.get(dateKey)!.push(mapDeadline(dl));
      }

      const entries: DeadlineCalendarEntry[] = [...grouped.entries()].map(
        ([date, dls]) => ({ date, deadlines: dls }),
      );

      const response: ApiResponse<{
        month: number;
        year: number;
        entries: DeadlineCalendarEntry[];
        totalDeadlines: number;
      }> = {
        success: true,
        data: {
          month,
          year,
          entries,
          totalDeadlines: deadlines.length,
        },
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/deadlines/export ───────────────────────

deadlinesRouter.get(
  "/export",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.user!;
      const clientId = req.query.clientId as string | undefined;

      const where: Prisma.ExtractedDeadlineWhereInput = { firmId };
      if (clientId) where.clientId = clientId;

      // Fetch all future deadlines + deadlines from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      where.date = { gte: thirtyDaysAgo };

      const deadlines = await prisma.extractedDeadline.findMany({
        where,
        orderBy: { date: "asc" },
        include: {
          document: { select: { filename: true } },
          client: { select: { name: true } },
        },
      });

      // Generate ICS content
      const icsLines: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//AI Accounting//Deadlines//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Compliance Deadlines",
      ];

      for (const dl of deadlines) {
        const dateStr = dl.date.toISOString().split("T")[0].replace(/-/g, "");
        const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

        const summary = dl.client
          ? `${dl.description} - ${dl.client.name}`
          : dl.description;

        icsLines.push(
          "BEGIN:VEVENT",
          `DTSTART;VALUE=DATE:${dateStr}`,
          `DTEND;VALUE=DATE:${dateStr}`,
          `DTSTAMP:${now}`,
          `UID:${dl.id}@ai-accounting`,
          `SUMMARY:${escapeIcs(summary)}`,
          `DESCRIPTION:${escapeIcs(`Source: ${dl.document.filename}\\nConfidence: ${dl.confidence}`)}`,
          `CATEGORIES:Compliance`,
          "END:VEVENT",
        );
      }

      icsLines.push("END:VCALENDAR");

      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="deadlines.ics"');
      res.send(icsLines.join("\r\n"));
    } catch (err) {
      next(err);
    }
  },
);

// ─── Helpers ─────────────────────────────────────────

function mapDeadline(dl: {
  id: string;
  firmId: string;
  documentId: string;
  clientId: string | null;
  date: Date;
  description: string;
  rawText: string;
  confidence: string;
  alertId: string | null;
  createdAt: Date;
  document?: { id: string; filename: string } | null;
  client?: { id: string; name: string } | null;
}): ExtractedDeadline {
  return {
    id: dl.id,
    firmId: dl.firmId,
    documentId: dl.documentId,
    clientId: dl.clientId ?? undefined,
    date: dl.date,
    description: dl.description,
    rawText: dl.rawText,
    confidence: dl.confidence as "HIGH" | "MEDIUM" | "LOW",
    alertId: dl.alertId ?? undefined,
    createdAt: dl.createdAt,
    document: dl.document ?? undefined,
    client: dl.client ?? undefined,
  };
}

/** Escape text for ICS format. */
function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
