/**
 * Dashboard router — Command Centre API endpoints.
 *
 * GET    /api/dashboard/command-centre   — full command centre payload
 * GET    /api/dashboard/briefing         — today's daily briefing
 * GET    /api/dashboard/alerts           — paginated alert list
 * PATCH  /api/dashboard/alerts/:id/read  — mark alert as read
 * PATCH  /api/dashboard/alerts/:id/resolve — resolve alert
 */

import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import type { Prisma } from "@prisma/client";
import type {
  ApiResponse,
  PaginatedResponse,
  Alert,
  DailyBriefing,
  CommandCentreResponse,
  AlertListQuery,
} from "@ai-accounting/shared";
import { alertListQuerySchema } from "@ai-accounting/shared";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limiter";
import { prisma } from "../lib/prisma";
import { getRedis } from "../lib/redis";
import { generateDailyBriefing } from "../lib/briefing-generator";
import { getDailyTokenUsage } from "../lib/token-usage";
import { ApiError } from "../lib/api-error";

export const dashboardRouter: Router = Router();

dashboardRouter.use(requireAuth);
dashboardRouter.use(rateLimit);

// ─── Constants ───────────────────────────────────────

const COMMAND_CENTRE_CACHE_TTL = 15 * 60; // 15 minutes
const DAILY_TOKEN_CAP_PER_FIRM = parseInt(
  process.env.DAILY_TOKEN_CAP_PER_FIRM || "50000",
);

// ─── GET /api/dashboard/command-centre ───────────────

dashboardRouter.get(
  "/command-centre",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.user!;
      const cacheKey = `command-centre:${firmId}`;

      // 1. Check Redis cache
      try {
        const redis = getRedis();
        const cached = await redis.get(cacheKey);
        if (cached) {
          const response: ApiResponse<CommandCentreResponse> = {
            success: true,
            data: JSON.parse(cached),
          };
          res.json(response);
          return;
        }
      } catch {
        // Redis miss — compute fresh
      }

      // 2. Generate or fetch today's briefing
      let briefing: DailyBriefing | null = null;
      let generatedNow = false;
      try {
        const result = await generateDailyBriefing(firmId);
        briefing = {
          id: result.id,
          firmId: result.firmId,
          date: result.date,
          summary: result.summary,
          clientCount: result.clientCount,
          alertCount: result.alertCount,
          metadata: result.metadata,
          createdAt: result.createdAt,
        };
        generatedNow = true;
      } catch {
        // Briefing generation failed — return null
      }

      // 3. Fetch alerts (top 10 unread)
      const alerts = await prisma.alert.findMany({
        where: { firmId, isRead: false },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        take: 10,
        include: { client: { select: { id: true, name: true } } },
      });

      // 4. Unread alert count
      const unreadAlertCount = await prisma.alert.count({
        where: { firmId, isRead: false },
      });

      // 5. Clients needing attention (no documents in 30+ days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const allClients = await prisma.client.findMany({
        where: { firmId },
        select: {
          id: true,
          name: true,
          identifier: true,
          documents: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      });

      const clientsNeedingAttention = allClients
        .filter((c) => {
          if (c.documents.length === 0) return false;
          return c.documents[0].createdAt < thirtyDaysAgo;
        })
        .map((c) => ({
          id: c.id,
          name: c.name,
          identifier: c.identifier,
          daysSinceLastDocument: Math.floor(
            (Date.now() - c.documents[0].createdAt.getTime()) / (24 * 60 * 60 * 1000),
          ),
        }))
        .sort((a, b) => b.daysSinceLastDocument - a.daysSinceLastDocument)
        .slice(0, 10);

      // 6. Recent activity (top 5 clients by documents in last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentActivityRaw = await prisma.document.groupBy({
        by: ["clientId"],
        where: {
          firmId,
          clientId: { not: null },
          createdAt: { gt: sevenDaysAgo },
        },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 5,
      });

      // Resolve client names
      const clientIds = recentActivityRaw
        .map((r) => r.clientId)
        .filter((id): id is string => id !== null);
      const clientMap = clientIds.length
        ? await prisma.client
            .findMany({
              where: { id: { in: clientIds } },
              select: { id: true, name: true },
            })
            .then((clients) => Object.fromEntries(clients.map((c) => [c.id, c.name])))
        : {};

      const recentActivity = recentActivityRaw
        .filter((r) => r.clientId !== null)
        .map((r) => ({
          clientId: r.clientId!,
          clientName: clientMap[r.clientId!] ?? "Unknown",
          documentCount: r._count.id,
        }));

      // 7. Token usage
      const tokenUsageToday = await getDailyTokenUsage(firmId);

      // 8. Build response
      const payload: CommandCentreResponse = {
        briefing,
        generatedNow,
        alerts: alerts.map((a) => ({
          id: a.id,
          firmId: a.firmId,
          clientId: a.clientId ?? undefined,
          type: a.type as Alert["type"],
          severity: a.severity as Alert["severity"],
          title: a.title,
          body: a.body,
          metadata: a.metadata as Record<string, unknown>,
          isRead: a.isRead,
          resolvedAt: a.resolvedAt ?? undefined,
          createdAt: a.createdAt,
          expiresAt: a.expiresAt ?? undefined,
          client: a.client ? { id: a.client.id, name: a.client.name } : undefined,
        })),
        unreadAlertCount,
        clientsNeedingAttention,
        recentActivity,
        tokenUsage: {
          today: tokenUsageToday,
          cap: DAILY_TOKEN_CAP_PER_FIRM,
        },
      };

      // 9. Cache in Redis
      try {
        const redis = getRedis();
        await redis.set(
          cacheKey,
          JSON.stringify(payload),
          "EX",
          COMMAND_CENTRE_CACHE_TTL,
        );
      } catch {
        // Non-critical
      }

      const response: ApiResponse<CommandCentreResponse> = {
        success: true,
        data: payload,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/dashboard/briefing ─────────────────────

dashboardRouter.get(
  "/briefing",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.user!;
      const briefing = await generateDailyBriefing(firmId);

      const response: ApiResponse<DailyBriefing> = {
        success: true,
        data: {
          id: briefing.id,
          firmId: briefing.firmId,
          date: briefing.date,
          summary: briefing.summary,
          clientCount: briefing.clientCount,
          alertCount: briefing.alertCount,
          metadata: briefing.metadata,
          createdAt: briefing.createdAt,
        },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/dashboard/alerts ───────────────────────

dashboardRouter.get(
  "/alerts",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.user!;

      // Validate query params
      const parsed = alertListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join("; "));
      }
      const { severity, unreadOnly, page, limit } = parsed.data as AlertListQuery;

      // Build where clause
      const where: Prisma.AlertWhereInput = { firmId };
      if (severity) where.severity = severity;
      if (unreadOnly) where.isRead = false;

      const [alerts, total] = await Promise.all([
        prisma.alert.findMany({
          where,
          orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
          skip: (page - 1) * limit,
          take: limit,
          include: { client: { select: { id: true, name: true } } },
        }),
        prisma.alert.count({ where }),
      ]);

      const response: PaginatedResponse<Alert> = {
        success: true,
        data: alerts.map((a) => ({
          id: a.id,
          firmId: a.firmId,
          clientId: a.clientId ?? undefined,
          type: a.type as Alert["type"],
          severity: a.severity as Alert["severity"],
          title: a.title,
          body: a.body,
          metadata: a.metadata as Record<string, unknown>,
          isRead: a.isRead,
          resolvedAt: a.resolvedAt ?? undefined,
          createdAt: a.createdAt,
          expiresAt: a.expiresAt ?? undefined,
          client: a.client ? { id: a.client.id, name: a.client.name } : undefined,
        })),
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
  },
);

// ─── PATCH /api/dashboard/alerts/:id/read ────────────

dashboardRouter.patch(
  "/alerts/:id/read",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.user!;
      const alertId = String(req.params.id);

      const alert = await prisma.alert.findFirst({
        where: { id: alertId, firmId },
      });
      if (!alert) throw ApiError.notFound("Alert not found");

      const updated = await prisma.alert.update({
        where: { id: alertId },
        data: { isRead: true },
      });

      // Invalidate command-centre cache
      try {
        const redis = getRedis();
        await redis.del(`command-centre:${firmId}`);
      } catch {
        // Non-critical
      }

      const response: ApiResponse = {
        success: true,
        data: updated,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /api/dashboard/alerts/:id/resolve ─────────

dashboardRouter.patch(
  "/alerts/:id/resolve",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.user!;
      const alertId = String(req.params.id);

      const alert = await prisma.alert.findFirst({
        where: { id: alertId, firmId },
      });
      if (!alert) throw ApiError.notFound("Alert not found");

      const updated = await prisma.alert.update({
        where: { id: alertId },
        data: { isRead: true, resolvedAt: new Date() },
      });

      // Invalidate command-centre cache
      try {
        const redis = getRedis();
        await redis.del(`command-centre:${firmId}`);
      } catch {
        // Non-critical
      }

      const response: ApiResponse = {
        success: true,
        data: updated,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);
