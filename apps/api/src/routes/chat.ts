import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import type {
  ApiResponse,
  ChatRequest,
  ChatResponse,
  ChatSource,
  PaginatedResponse,
} from "@ai-accounting/shared";
import { chatRequestSchema } from "@ai-accounting/shared";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limiter";
import { validate } from "../middleware/validate";
import { prisma } from "../lib/prisma";
import {
  searchChunks,
  generateRagAnswer,
  computeConfidence,
  type SearchResult,
  type RagAnswer,
} from "../lib/rag";
import crypto from "crypto";
import { getRedis } from "../lib/redis";

export const chatRouter: Router = Router();

// All chat routes require authentication + rate limiting
chatRouter.use(requireAuth);
chatRouter.use(rateLimit);

// ─── POST /api/chat — submit query → RAG pipeline ───────────────
chatRouter.post(
  "/",
  validate(chatRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as ChatRequest;
      const { userId, firmId } = req.user!;
      const totalStart = Date.now();

      // ── Cache check ──────────────────────────────────────
      const normalizedQuery = body.query
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      const cacheKey = `chat:${crypto
        .createHash("sha256")
        .update(
          `${firmId}:${normalizedQuery}:${body.clientId ?? ""}:${JSON.stringify(body.filters ?? {})}`,
        )
        .digest("hex")}`;

      const redis = getRedis();
      const cached = await redis.get(cacheKey);
      if (cached) {
        try {
          const cachedData = JSON.parse(cached) as {
            answer: string;
            sources: ChatSource[];
            suggestedFollowups: string[];
            confidence: { level: string; score: number };
            metadata: Record<string, unknown>;
          };

          // Still persist the query for history
          const queryRecord = await prisma.query.create({
            data: {
              firmId,
              userId,
              clientId: body.clientId ?? null,
              queryText: body.query,
              responseText: cachedData.answer,
              retrievedChunkIds: [],
              chunksSentToLlm: 0,
              llmModel: "cache",
              llmTokensPrompt: 0,
              llmTokensCompletion: 0,
              llmCostInr: 0,
              latencyMs: Date.now() - totalStart,
              retrievalLatencyMs: 0,
            },
          });

          const response: ApiResponse<ChatResponse> = {
            success: true,
            data: {
              queryId: queryRecord.id,
              ...cachedData,
              metadata: {
                ...cachedData.metadata,
                latencyMs: Date.now() - totalStart,
                cached: true,
              },
            } as ChatResponse,
          };
          res.json(response);
          return;
        } catch {
          // Cache parse error — fall through to live query
        }
      }

      // ── Live query ────────────────────────────────────────
      // 1. Vector similarity search — hard cutoff at 0.55, NO fallback
      const retrievalStart = Date.now();
      const searchResults = await searchChunks(body.query, firmId, {
        clientId: body.clientId,
        dateFrom: body.filters?.dateFrom,
        dateTo: body.filters?.dateTo,
        sources: body.filters?.source,
      });
      const retrievalLatencyMs = Date.now() - retrievalStart;

      // 2. Compute confidence from retrieved chunks
      const confidence = computeConfidence(searchResults);

      // 3. LLM generation grounded in retrieved chunks
      const ragAnswer = await generateRagAnswer(
        body.query,
        searchResults,
        firmId,
      );

      const latencyMs = Date.now() - totalStart;

      // 4. Build ChatSource list — one entry per unique document (best chunk wins)
      const sources = buildChatSources(searchResults);

      // 5. Persist the query record for history + analytics
      const queryRecord = await prisma.query.create({
        data: {
          firmId,
          userId,
          clientId: body.clientId ?? null,
          queryText: body.query,
          responseText: ragAnswer.answer,
          retrievedChunkIds: searchResults.map((r) => r.chunkId),
          chunksSentToLlm: searchResults.length,
          llmModel: ragAnswer.model,
          llmTokensPrompt: ragAnswer.tokensPrompt,
          llmTokensCompletion: ragAnswer.tokensCompletion,
          llmCostInr: ragAnswer.costInr,
          latencyMs,
          retrievalLatencyMs,
        },
      });

      // 6. Build response
      const responseData: ChatResponse = {
        queryId: queryRecord.id,
        answer: ragAnswer.answer,
        sources,
        suggestedFollowups: ragAnswer.suggestedFollowups,
        confidence,
        metadata: {
          model: ragAnswer.model,
          tokensPrompt: ragAnswer.tokensPrompt,
          tokensCompletion: ragAnswer.tokensCompletion,
          costEstimateInr: ragAnswer.costInr,
          latencyMs,
          retrievalLatencyMs,
          chunksRetrieved: searchResults.length,
          chunksUsed: searchResults.length,
          cached: false,
        },
      };

      // 7. Cache the response in Redis for 24 hours
      try {
        await redis.set(
          cacheKey,
          JSON.stringify({
            answer: responseData.answer,
            sources: responseData.sources,
            suggestedFollowups: responseData.suggestedFollowups,
            confidence: responseData.confidence,
            metadata: {
              model: responseData.metadata.model,
              tokensPrompt: responseData.metadata.tokensPrompt,
              tokensCompletion: responseData.metadata.tokensCompletion,
              costEstimateInr: responseData.metadata.costEstimateInr,
              latencyMs: responseData.metadata.latencyMs,
              retrievalLatencyMs: responseData.metadata.retrievalLatencyMs,
              chunksRetrieved: responseData.metadata.chunksRetrieved,
              chunksUsed: responseData.metadata.chunksUsed,
              cached: false,
            },
          }),
          "EX",
          86400, // 24 hours
        );
      } catch {
        // Cache write failure is non-fatal
      }

      const response: ApiResponse<ChatResponse> = {
        success: true,
        data: responseData,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/** Collapse multiple chunks from the same document into a single ChatSource. */
function buildChatSources(results: SearchResult[]): ChatSource[] {
  const docMap = new Map<string, SearchResult>();
  for (const r of results) {
    const existing = docMap.get(r.documentId);
    if (!existing || r.score > existing.score) {
      docMap.set(r.documentId, r);
    }
  }

  return Array.from(docMap.values()).map((r) => ({
    docId: r.documentId,
    filename: r.filename,
    excerpt:
      r.chunkText.length > 200 ? r.chunkText.slice(0, 200) + "…" : r.chunkText,
    sourceDate: r.sourceDate.toISOString().split("T")[0]!,
    relevanceScore: Math.round(r.score * 100) / 100,
  }));
}

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
