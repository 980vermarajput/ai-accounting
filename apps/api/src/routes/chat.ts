import { Router, Request, Response, NextFunction } from "express";
import type {
  ApiResponse,
  ChatRequest,
  ChatResponse,
  PaginatedResponse,
} from "@ai-accounting/shared";
import { chatRequestSchema } from "@ai-accounting/shared";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { prisma } from "../lib/prisma";

export const chatRouter: Router = Router();

// All chat routes require authentication
chatRouter.use(requireAuth);

// ─── POST /api/chat — submit query → RAG pipeline ───────────────
chatRouter.post(
  "/",
  validate(chatRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as ChatRequest;
      const startTime = Date.now();

      // TODO: implement full RAG pipeline
      // 1. Generate embedding for query
      // 2. Vector search in pgvector (top-K=8, min similarity 0.72)
      // 3. Apply recency weighting
      // 4. Build prompt with system message + context chunks
      // 5. Call LLM (GPT-4o-mini)
      // 6. Extract source citations
      // 7. Store query record

      const latencyMs = Date.now() - startTime;

      const response: ApiResponse<ChatResponse> = {
        success: false,
        error: {
          code: "NOT_IMPLEMENTED",
          message: "RAG chat pipeline not yet implemented",
        },
      };
      res.status(501).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/chat/history — query history with pagination ───────
chatRouter.get(
  "/history",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = "1", pageSize = "20" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const size = Math.min(
        100,
        Math.max(1, parseInt(pageSize as string, 10) || 20),
      );

      const where = { firmId: req.user!.firmId, userId: req.user!.userId };

      const [queries, total] = await Promise.all([
        prisma.query.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (pageNum - 1) * size,
          take: size,
          select: {
            id: true,
            queryText: true,
            responseText: true,
            feedback: true,
            createdAt: true,
            clientId: true,
          },
        }),
        prisma.query.count({ where }),
      ]);

      const response: PaginatedResponse<(typeof queries)[0]> = {
        success: true,
        data: queries,
        pagination: {
          page: pageNum,
          pageSize: size,
          total,
          totalPages: Math.ceil(total / size),
        },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/chat/:queryId/feedback — thumbs up/down ──────────
chatRouter.post(
  "/:queryId/feedback",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { feedback } = req.body;

      if (!["positive", "negative", "none"].includes(feedback)) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "feedback must be positive, negative, or none",
          },
        };
        res.status(400).json(response);
        return;
      }

      const queryId = String(req.params.queryId);
      const query = await prisma.query.findFirst({
        where: { id: queryId, firmId: req.user!.firmId },
      });

      if (!query) {
        const response: ApiResponse = {
          success: false,
          error: { code: "NOT_FOUND", message: "Query not found" },
        };
        res.status(404).json(response);
        return;
      }

      await prisma.query.update({
        where: { id: query.id },
        data: { feedback },
      });

      const response: ApiResponse = {
        success: true,
        data: { message: "Feedback recorded", queryId: query.id, feedback },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);
