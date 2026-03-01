/**
 * Unit tests for routes/dashboard.ts
 *
 * Strategy:
 *  - Mock prisma, redis, briefing-generator, and token-usage
 *  - Test each endpoint independently using express test harness
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ─── Mock Prisma ────────────────────────────────────────────────

vi.mock("../lib/prisma", () => ({
  prisma: {
    alert: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    client: {
      findMany: vi.fn(),
    },
    document: {
      groupBy: vi.fn(),
    },
    dailyBriefing: {
      findUnique: vi.fn(),
    },
  },
}));

// ─── Mock Redis ─────────────────────────────────────────────────

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();

vi.mock("../lib/redis", () => ({
  getRedis: () => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  }),
}));

// ─── Mock briefing-generator ────────────────────────────────────

vi.mock("../lib/briefing-generator", () => ({
  generateDailyBriefing: vi.fn(),
}));

// ─── Mock token-usage ───────────────────────────────────────────

vi.mock("../lib/token-usage", () => ({
  getDailyTokenUsage: vi.fn().mockResolvedValue(1500),
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

// ─── Imports ────────────────────────────────────────────────────

import { prisma } from "../lib/prisma";
import { generateDailyBriefing } from "../lib/briefing-generator";
import { dashboardRouter } from "./dashboard";

// ─── Test app ───────────────────────────────────────────────────

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/dashboard", dashboardRouter);
  return app;
}

const FIRM_ID = "firm-001";

describe("dashboard routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue("OK");
    mockRedisDel.mockResolvedValue(1);
  });

  // ── GET /api/dashboard/alerts ─────────────────────────────

  describe("GET /api/dashboard/alerts", () => {
    it("returns paginated alerts", async () => {
      const mockAlerts = [
        {
          id: "alert-1",
          firmId: FIRM_ID,
          clientId: null,
          type: "SYNC_FAILURE",
          severity: "HIGH",
          title: "Gmail sync failed",
          body: "Sync error on last attempt",
          metadata: {},
          isRead: false,
          resolvedAt: null,
          createdAt: new Date(),
          expiresAt: null,
          client: null,
        },
      ];

      vi.mocked(prisma.alert.findMany).mockResolvedValue(mockAlerts as any);
      vi.mocked(prisma.alert.count).mockResolvedValue(1);

      const app = createApp();
      const res = await request(app).get("/api/dashboard/alerts");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });

    it("filters by severity when query param is provided", async () => {
      vi.mocked(prisma.alert.findMany).mockResolvedValue([]);
      vi.mocked(prisma.alert.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get("/api/dashboard/alerts?severity=CRITICAL");

      expect(res.status).toBe(200);
      expect(vi.mocked(prisma.alert.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            severity: "CRITICAL",
          }),
        }),
      );
    });

    it("filters unread-only when query param is provided", async () => {
      vi.mocked(prisma.alert.findMany).mockResolvedValue([]);
      vi.mocked(prisma.alert.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get("/api/dashboard/alerts?unreadOnly=true");

      expect(res.status).toBe(200);
      expect(vi.mocked(prisma.alert.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isRead: false,
          }),
        }),
      );
    });
  });

  // ── PATCH /api/dashboard/alerts/:id/read ──────────────────

  describe("PATCH /api/dashboard/alerts/:id/read", () => {
    it("marks an alert as read", async () => {
      vi.mocked(prisma.alert.findFirst).mockResolvedValue({
        id: "alert-1",
        firmId: FIRM_ID,
      } as any);

      vi.mocked(prisma.alert.update).mockResolvedValue({
        id: "alert-1",
        isRead: true,
      } as any);

      const app = createApp();
      const res = await request(app).patch("/api/dashboard/alerts/alert-1/read");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(vi.mocked(prisma.alert.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "alert-1" },
          data: { isRead: true },
        }),
      );
    });

    it("returns 404 when alert not found", async () => {
      vi.mocked(prisma.alert.findFirst).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).patch("/api/dashboard/alerts/nonexistent/read");

      expect(res.status).toBe(404);
    });

    it("invalidates command-centre cache on read", async () => {
      vi.mocked(prisma.alert.findFirst).mockResolvedValue({
        id: "alert-1",
        firmId: FIRM_ID,
      } as any);
      vi.mocked(prisma.alert.update).mockResolvedValue({
        id: "alert-1",
        isRead: true,
      } as any);

      const app = createApp();
      await request(app).patch("/api/dashboard/alerts/alert-1/read");

      expect(mockRedisDel).toHaveBeenCalledWith(`command-centre:${FIRM_ID}`);
    });
  });

  // ── PATCH /api/dashboard/alerts/:id/resolve ───────────────

  describe("PATCH /api/dashboard/alerts/:id/resolve", () => {
    it("resolves an alert and marks as read", async () => {
      vi.mocked(prisma.alert.findFirst).mockResolvedValue({
        id: "alert-2",
        firmId: FIRM_ID,
      } as any);

      vi.mocked(prisma.alert.update).mockResolvedValue({
        id: "alert-2",
        isRead: true,
        resolvedAt: new Date(),
      } as any);

      const app = createApp();
      const res = await request(app).patch("/api/dashboard/alerts/alert-2/resolve");

      expect(res.status).toBe(200);
      expect(vi.mocked(prisma.alert.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isRead: true,
            resolvedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("returns 404 for nonexistent alert", async () => {
      vi.mocked(prisma.alert.findFirst).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).patch("/api/dashboard/alerts/bad-id/resolve");

      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/dashboard/briefing ───────────────────────────

  describe("GET /api/dashboard/briefing", () => {
    it("returns the daily briefing", async () => {
      vi.mocked(generateDailyBriefing).mockResolvedValue({
        id: "briefing-1",
        firmId: FIRM_ID,
        date: new Date(),
        summary: "All is well today.",
        clientCount: 5,
        alertCount: 2,
        metadata: {},
        createdAt: new Date(),
      });

      const app = createApp();
      const res = await request(app).get("/api/dashboard/briefing");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBe("All is well today.");
    });
  });
});
