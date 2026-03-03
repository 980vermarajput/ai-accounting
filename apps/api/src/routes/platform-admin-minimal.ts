import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import type { ApiResponse } from "@ai-accounting/shared";
import { requireAdminAuth } from "../middleware/admin-auth";
import { prisma } from "../lib/prisma";
import { getGlobalMetrics } from "../lib/metrics";

export const platformAdminRouter: Router = Router();

// All platform admin routes require platform admin authentication
platformAdminRouter.use(requireAdminAuth);

// ─── GET /api/platform-admin/firms — List all firms ─────────
platformAdminRouter.get(
  "/firms",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get all firms with basic stats
      const firms = await prisma.firm.findMany({
        orderBy: { createdAt: "desc" },
        take: 50, // Limit to 50 for now
        include: {
          _count: {
            select: {
              users: true,
              documents: true,
              queries: true,
            },
          },
        },
      });

      const response: ApiResponse<typeof firms> = {
        success: true,
        data: firms,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /api/platform-admin/usage — Global platform usage stats ───────
platformAdminRouter.get(
  "/usage",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [globalMetrics, firmCount] = await Promise.all([
        getGlobalMetrics(),
        prisma.firm.count(),
      ]);

      // Get recent cost data
      const costStats = await prisma.query.aggregate({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
        _sum: {
          llmTokensPrompt: true,
          llmTokensCompletion: true,
          llmCostInr: true,
        },
      });

      const usage = {
        totalFirms: firmCount,
        totalTokensLast30d:
          (costStats._sum.llmTokensPrompt || 0) +
          (costStats._sum.llmTokensCompletion || 0),
        estimatedCostLast30d: Number(costStats._sum.llmCostInr) || 0,
        queriesLast24h: globalMetrics.totalRequestsToday,
        p95LatencyMs: globalMetrics.p95LatencyMs,
      };

      const response: ApiResponse<typeof usage> = {
        success: true,
        data: usage,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /api/platform-admin/sync-failures — Recent sync failures ──────
platformAdminRouter.get(
  "/sync-failures",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const failures = await prisma.syncJob.findMany({
        where: {
          status: "failed",
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
        take: 50, // Limit to 50
        orderBy: { createdAt: "desc" },
        include: {
          firm: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      const response: ApiResponse<typeof failures> = {
        success: true,
        data: failures,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);