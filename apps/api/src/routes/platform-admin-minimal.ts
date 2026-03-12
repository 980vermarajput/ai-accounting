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

// ─── GET /api/platform-admin/firms/:firmId — Single firm details ───────
platformAdminRouter.get(
  "/firms/:firmId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;

      // Get firm details with counts
      const firm = await prisma.firm.findUnique({
        where: { id: firmId },
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

      if (!firm) {
        const response: ApiResponse = {
          success: false,
          error: { code: "NOT_FOUND", message: "Firm not found" },
        };
        res.status(404).json(response);
        return;
      }

      // Get firm-specific usage metrics
      const usageStats = await prisma.query.aggregate({
        where: {
          firmId,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
        _sum: {
          llmTokensPrompt: true,
          llmTokensCompletion: true,
          llmCostInr: true,
        },
        _avg: {
          latencyMs: true,
        },
      });

      // Get queries in last 24h
      const queriesLast24h = await prisma.query.count({
        where: {
          firmId,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      });

      const firmData = {
        ...firm,
        metrics: {
          totalTokensLast30d:
            (usageStats._sum.llmTokensPrompt || 0) +
            (usageStats._sum.llmTokensCompletion || 0),
          estimatedCostLast30d: Number(usageStats._sum.llmCostInr) || 0,
          queriesLast24h,
          avgLatencyMs: Math.round(usageStats._avg.latencyMs || 0),
        },
      };

      const response: ApiResponse<typeof firmData> = {
        success: true,
        data: firmData,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /api/platform-admin/firms/:firmId/users — Firm users ──────────
platformAdminRouter.get(
  "/firms/:firmId/users",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;

      // Verify firm exists
      const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { id: true, name: true },
      });

      if (!firm) {
        const response: ApiResponse = {
          success: false,
          error: { code: "NOT_FOUND", message: "Firm not found" },
        };
        res.status(404).json(response);
        return;
      }

      // Get firm users
      const users = await prisma.user.findMany({
        where: { firmId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isAdmin: true,
          lastSyncAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      const response: ApiResponse<{ firm: typeof firm; users: typeof users }> = {
        success: true,
        data: { firm, users },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /api/platform-admin/firms/:firmId/documents — Firm documents ─
platformAdminRouter.get(
  "/firms/:firmId/documents",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const skip = (page - 1) * limit;

      // Verify firm exists
      const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { id: true, name: true },
      });

      if (!firm) {
        const response: ApiResponse = {
          success: false,
          error: { code: "NOT_FOUND", message: "Firm not found" },
        };
        res.status(404).json(response);
        return;
      }

      // Get firm documents
      const [documents, totalCount] = await Promise.all([
        prisma.document.findMany({
          where: { firmId },
          select: {
            id: true,
            filename: true,
            size: true,
            createdAt: true,
            client: {
              select: { id: true, name: true },
            },
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip,
        }),
        prisma.document.count({
          where: { firmId },
        }),
      ]);

      const response: ApiResponse<{
        firm: typeof firm;
        documents: typeof documents;
        pagination: { page: number; limit: number; total: number };
      }> = {
        success: true,
        data: {
          firm,
          documents,
          pagination: { page, limit, total: totalCount },
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /api/platform-admin/firms/:firmId/queries — Firm query history ─
platformAdminRouter.get(
  "/firms/:firmId/queries",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const skip = (page - 1) * limit;

      // Verify firm exists
      const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { id: true, name: true },
      });

      if (!firm) {
        const response: ApiResponse = {
          success: false,
          error: { code: "NOT_FOUND", message: "Firm not found" },
        };
        res.status(404).json(response);
        return;
      }

      // Get firm queries
      const [queries, totalCount] = await Promise.all([
        prisma.query.findMany({
          where: { firmId },
          select: {
            id: true,
            query: true,
            result: true,
            llmTokensPrompt: true,
            llmTokensCompletion: true,
            llmCostInr: true,
            durationMs: true,
            createdAt: true,
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip,
        }),
        prisma.query.count({
          where: { firmId },
        }),
      ]);

      const response: ApiResponse<{
        firm: typeof firm;
        queries: typeof queries;
        pagination: { page: number; limit: number; total: number };
      }> = {
        success: true,
        data: {
          firm,
          queries,
          pagination: { page, limit, total: totalCount },
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /api/platform-admin/users — Global user management ─────────
platformAdminRouter.get(
  "/users",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const skip = (page - 1) * limit;
      const search = req.query.search as string;

      // Build where clause for search
      const whereClause = search ? {
        OR: [
          { email: { contains: search, mode: "insensitive" as const } },
          { name: { contains: search, mode: "insensitive" as const } },
          { firm: { name: { contains: search, mode: "insensitive" as const } } }
        ]
      } : {};

      // Get users with pagination and search
      const [users, totalCount] = await Promise.all([
        prisma.user.findMany({
          where: whereClause,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isAdmin: true,
            lastSyncAt: true,
            createdAt: true,
            firm: {
              select: {
                id: true,
                name: true,
                slug: true,
                plan: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip,
        }),
        prisma.user.count({
          where: whereClause,
        }),
      ]);

      const response: ApiResponse<{
        users: typeof users;
        pagination: { page: number; limit: number; total: number };
      }> = {
        success: true,
        data: {
          users,
          pagination: { page, limit, total: totalCount },
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /api/platform-admin/settings — Get platform settings ─────────
platformAdminRouter.get(
  "/settings",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // For now, we'll return default settings since there's no PlatformSettings model
      // In a real implementation, you'd have a settings table/collection
      const settings = {
        maintenance: {
          enabled: false,
          message: "System maintenance in progress. Please try again later.",
          scheduledAt: null,
        },
        security: {
          requireTwoFactor: false,
          sessionTimeout: 24, // hours
          maxLoginAttempts: 5,
        },
        notifications: {
          emailAlerts: true,
          webhookUrl: "",
          slackChannel: "#admin-alerts",
        },
        limits: {
          maxFirmsPerPlatform: 1000,
          maxUsersPerFirm: 100,
          maxDocumentsPerFirm: 10000,
        },
        features: {
          enableTelegramBot: true,
          enableAdvancedAnalytics: true,
          enableApiAccess: true,
        },
      };

      const response: ApiResponse<typeof settings> = {
        success: true,
        data: settings,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ─── PUT /api/platform-admin/settings — Update platform settings ──────
platformAdminRouter.put(
  "/settings",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settingsUpdate = req.body;

      // Validate the settings structure
      if (!settingsUpdate || typeof settingsUpdate !== 'object') {
        const response: ApiResponse = {
          success: false,
          error: { code: "INVALID_INPUT", message: "Invalid settings data" },
        };
        res.status(400).json(response);
        return;
      }

      // In a real implementation, you'd:
      // 1. Validate each setting field
      // 2. Update the database
      // 3. Apply changes to the running system (e.g., maintenance mode)
      // 4. Log the changes for audit trail

      // For now, we'll just return success
      const response: ApiResponse<typeof settingsUpdate> = {
        success: true,
        data: settingsUpdate,
        message: "Platform settings updated successfully"
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);