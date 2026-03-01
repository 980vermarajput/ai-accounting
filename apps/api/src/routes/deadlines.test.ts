/**
 * Unit tests for routes/deadlines.ts
 *
 * Strategy:
 *  - Mock prisma, auth middleware, rate limiter
 *  - Test each endpoint independently using supertest
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ─── Mock Prisma ────────────────────────────────────────────────

vi.mock("../lib/prisma", () => ({
  prisma: {
    extractedDeadline: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// ─── Mock auth middleware ───────────────────────────────────────

vi.mock("../middleware/auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => {
    _req.user = {
      userId: "user-1",
      firmId: "firm-001",
      email: "test@example.com",
      role: "admin" as const,
    };
    next();
  },
}));

// ─── Mock rate limiter ──────────────────────────────────────────

vi.mock("../middleware/rate-limiter", () => ({
  rateLimit: (_req: any, _res: any, next: any) => next(),
}));

// ─── Mock api-error ─────────────────────────────────────────────

vi.mock("../lib/api-error", () => ({
  ApiError: class extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
    static notFound(msg: string) {
      return new this(404, msg);
    }
  },
}));

// ─── Imports ────────────────────────────────────────────────────

import { prisma } from "../lib/prisma";
import { deadlinesRouter } from "./deadlines";

// ─── Test app ───────────────────────────────────────────────────

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/deadlines", deadlinesRouter);
  return app;
}

const FIRM_ID = "firm-001";

describe("deadlines routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GET /api/deadlines ────────────────────────────────────

  describe("GET /api/deadlines", () => {
    it("returns paginated deadlines", async () => {
      const mockDeadlines = [
        {
          id: "dl-1",
          firmId: FIRM_ID,
          documentId: "doc-1",
          clientId: "client-1",
          date: new Date("2025-03-15"),
          description: "GST filing deadline",
          rawText: "GST filing deadline is 15/03/2025",
          confidence: "HIGH",
          alertId: "alert-1",
          createdAt: new Date(),
          document: { id: "doc-1", filename: "gst-notice.pdf" },
          client: { id: "client-1", name: "Mehta Traders" },
        },
      ];

      vi.mocked(prisma.extractedDeadline.findMany).mockResolvedValue(
        mockDeadlines as any,
      );
      vi.mocked(prisma.extractedDeadline.count).mockResolvedValue(1);

      const app = createApp();
      const res = await request(app).get("/api/deadlines");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].description).toBe("GST filing deadline");
      expect(res.body.pagination.total).toBe(1);
    });

    it("filters by clientId when provided", async () => {
      vi.mocked(prisma.extractedDeadline.findMany).mockResolvedValue([]);
      vi.mocked(prisma.extractedDeadline.count).mockResolvedValue(0);

      const app = createApp();
      const clientId = "00000000-0000-0000-0000-000000000001";
      const res = await request(app).get(`/api/deadlines?clientId=${clientId}`);

      expect(res.status).toBe(200);
      expect(vi.mocked(prisma.extractedDeadline.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            firmId: FIRM_ID,
            clientId: clientId,
          }),
        }),
      );
    });

    it("filters by date range when from/to provided", async () => {
      vi.mocked(prisma.extractedDeadline.findMany).mockResolvedValue([]);
      vi.mocked(prisma.extractedDeadline.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get("/api/deadlines?from=2025-03-01&to=2025-03-31");

      expect(res.status).toBe(200);
      expect(vi.mocked(prisma.extractedDeadline.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it("filters by confidence when provided", async () => {
      vi.mocked(prisma.extractedDeadline.findMany).mockResolvedValue([]);
      vi.mocked(prisma.extractedDeadline.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get("/api/deadlines?confidence=HIGH");

      expect(res.status).toBe(200);
      expect(vi.mocked(prisma.extractedDeadline.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            confidence: "HIGH",
          }),
        }),
      );
    });
  });

  // ── GET /api/deadlines/calendar ───────────────────────────

  describe("GET /api/deadlines/calendar", () => {
    it("returns deadlines grouped by date for a month", async () => {
      const mockDeadlines = [
        {
          id: "dl-1",
          firmId: FIRM_ID,
          documentId: "doc-1",
          clientId: null,
          date: new Date("2025-03-15"),
          description: "GST filing",
          rawText: "GST filing deadline",
          confidence: "HIGH",
          alertId: null,
          createdAt: new Date(),
          document: { id: "doc-1", filename: "notice.pdf" },
          client: null,
        },
        {
          id: "dl-2",
          firmId: FIRM_ID,
          documentId: "doc-2",
          clientId: null,
          date: new Date("2025-03-15"),
          description: "TDS return",
          rawText: "TDS return due",
          confidence: "MEDIUM",
          alertId: null,
          createdAt: new Date(),
          document: { id: "doc-2", filename: "tds.pdf" },
          client: null,
        },
      ];

      vi.mocked(prisma.extractedDeadline.findMany).mockResolvedValue(
        mockDeadlines as any,
      );

      const app = createApp();
      const res = await request(app).get("/api/deadlines/calendar?month=3&year=2025");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.month).toBe(3);
      expect(res.body.data.year).toBe(2025);
      expect(res.body.data.totalDeadlines).toBe(2);
      // Both deadlines on same date should be grouped
      expect(res.body.data.entries).toHaveLength(1);
      expect(res.body.data.entries[0].deadlines).toHaveLength(2);
    });

    it("returns empty entries when no deadlines in month", async () => {
      vi.mocked(prisma.extractedDeadline.findMany).mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get("/api/deadlines/calendar?month=6&year=2025");

      expect(res.status).toBe(200);
      expect(res.body.data.entries).toHaveLength(0);
      expect(res.body.data.totalDeadlines).toBe(0);
    });
  });

  // ── GET /api/deadlines/export ─────────────────────────────

  describe("GET /api/deadlines/export", () => {
    it("returns valid ICS content", async () => {
      const mockDeadlines = [
        {
          id: "dl-1",
          firmId: FIRM_ID,
          documentId: "doc-1",
          clientId: null,
          date: new Date("2025-03-15"),
          description: "GST filing deadline",
          rawText: "GST filing",
          confidence: "HIGH",
          alertId: null,
          createdAt: new Date(),
          document: { filename: "notice.pdf" },
          client: null,
        },
      ];

      vi.mocked(prisma.extractedDeadline.findMany).mockResolvedValue(
        mockDeadlines as any,
      );

      const app = createApp();
      const res = await request(app).get("/api/deadlines/export");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/calendar");
      expect(res.text).toContain("BEGIN:VCALENDAR");
      expect(res.text).toContain("BEGIN:VEVENT");
      expect(res.text).toContain("GST filing deadline");
      expect(res.text).toContain("END:VCALENDAR");
    });

    it("sets Content-Disposition for download", async () => {
      vi.mocked(prisma.extractedDeadline.findMany).mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get("/api/deadlines/export");

      expect(res.headers["content-disposition"]).toContain("deadlines.ics");
    });
  });
});
