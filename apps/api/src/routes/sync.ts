import { Router, Request, Response, NextFunction } from "express";
import type {
  ApiResponse,
  PaginatedResponse,
  SyncJob,
} from "@ai-accounting/shared";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/api-error";

export const syncRouter: Router = Router();

// All sync routes require authentication
syncRouter.use(requireAuth);

// ─── POST /api/sync/gmail — enqueue Gmail sync job ───────────────
syncRouter.post(
  "/gmail",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await prisma.syncJob.create({
        data: {
          firmId: req.user!.firmId,
          userId: req.user!.userId,
          type: "gmail",
          status: "queued",
        },
      });

      // TODO: add to BullMQ queue for async processing

      const response: ApiResponse = {
        success: true,
        data: { jobId: job.id, type: "gmail", status: "queued" },
      };
      res.status(202).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/sync/drive — enqueue Drive sync job ───────────────
syncRouter.post(
  "/drive",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await prisma.syncJob.create({
        data: {
          firmId: req.user!.firmId,
          userId: req.user!.userId,
          type: "drive",
          status: "queued",
        },
      });

      // TODO: add to BullMQ queue for async processing

      const response: ApiResponse = {
        success: true,
        data: { jobId: job.id, type: "drive", status: "queued" },
      };
      res.status(202).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/sync/status — per-user sync jobs with progress ─────
syncRouter.get(
  "/status",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobs = await prisma.syncJob.findMany({
        where: { firmId: req.user!.firmId, userId: req.user!.userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      const response: ApiResponse<SyncJob[]> = {
        success: true,
        data: jobs as unknown as SyncJob[],
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/sync/cancel/:jobId — cancel a running sync job ────
syncRouter.post(
  "/cancel/:jobId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = String(req.params.jobId);
      const job = await prisma.syncJob.findFirst({
        where: { id: jobId, firmId: req.user!.firmId },
      });

      if (!job) throw ApiError.notFound("Sync job not found");

      if (job.status === "completed" || job.status === "failed") {
        throw ApiError.badRequest(`Cannot cancel a ${job.status} job`);
      }

      await prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          errorMessage: "Cancelled by user",
          completedAt: new Date(),
        },
      });

      // TODO: cancel BullMQ job

      const response: ApiResponse = {
        success: true,
        data: { message: "Sync job cancelled", jobId: job.id },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);
