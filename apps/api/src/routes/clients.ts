/**
 * Clients router — client management + snapshot summaries.
 *
 * GET  /api/clients             — list clients for the firm
 * GET  /api/clients/:id/summary — client snapshot (30-second briefing)
 * POST /api/clients             — create a new client
 */

import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import type { Prisma } from "@prisma/client";
import type { ApiResponse, PaginatedResponse } from "@ai-accounting/shared";
import { createClientSchema } from "@ai-accounting/shared";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limiter";
import { validate } from "../middleware/validate";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/api-error";

export const clientsRouter: Router = Router();

clientsRouter.use(requireAuth);
clientsRouter.use(rateLimit);

// ─── GET /api/clients — list all clients for the firm ────────────
clientsRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.user!;
      const clients = await prisma.client.findMany({
        where: { firmId },
        orderBy: { name: "asc" },
      });

      const response: ApiResponse = {
        success: true,
        data: clients,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/clients — create a new client ─────────────────────
clientsRouter.post(
  "/",
  validate(createClientSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, userId } = req.user!;
      const { name, identifier, emailDomain, metadata } = req.body as {
        name: string;
        identifier: string;
        emailDomain?: string;
        metadata?: Record<string, unknown>;
      };

      const existing = await prisma.client.findFirst({
        where: { firmId, identifier },
        select: { id: true },
      });
      if (existing) {
        throw ApiError.conflict(
          `Client with identifier "${identifier}" already exists`,
        );
      }

      const client = await prisma.client.create({
        data: {
          firmId,
          createdBy: userId,
          name,
          identifier,
          emailDomain,
          metadata:
            metadata !== undefined
              ? (metadata as Prisma.InputJsonValue)
              : undefined,
        },
      });

      const response: ApiResponse = {
        success: true,
        data: client,
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/clients/:id/summary — client snapshot ─────────────
clientsRouter.get(
  "/:id/summary",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.user!;
      const clientId = String(req.params.id);

      // 1. Load the client
      const client = await prisma.client.findFirst({
        where: { id: clientId, firmId },
      });
      if (!client) throw ApiError.notFound("Client not found");

      // 2. Run all queries in parallel for speed
      const [
        documentCount,
        recentDocs,
        lastCommunication,
        queryCount,
        recentQueries,
        chunkCount,
      ] = await Promise.all([
        // Total documents linked to this client
        prisma.document.count({
          where: { firmId, clientId },
        }),

        // 5 most recent documents
        prisma.document.findMany({
          where: { firmId, clientId },
          orderBy: { sourceDate: "desc" },
          take: 5,
          select: {
            id: true,
            filename: true,
            source: true,
            status: true,
            sourceDate: true,
            summary: true,
          },
        }),

        // Last communication (most recent email document)
        prisma.document.findFirst({
          where: { firmId, clientId, source: "gmail" },
          orderBy: { sourceDate: "desc" },
          select: { sourceDate: true, filename: true },
        }),

        // Total queries about this client
        prisma.query.count({
          where: { firmId, clientId },
        }),

        // 3 most recent queries about this client
        prisma.query.findMany({
          where: { firmId, clientId },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: {
            id: true,
            queryText: true,
            responseText: true,
            feedback: true,
            createdAt: true,
          },
        }),

        // Total embedded chunks for this client
        prisma.chunk.count({
          where: { firmId, clientId },
        }),
      ]);

      // 3. Compute derived metrics
      const readyDocs = recentDocs.filter((d) => d.status === "ready").length;
      const errorDocs = recentDocs.filter((d) => d.status === "error").length;

      const daysSinceLastComm = lastCommunication
        ? Math.floor(
            (Date.now() - new Date(lastCommunication.sourceDate).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : null;

      // Simple risk indicator based on communication recency
      let riskLevel: "low" | "medium" | "high" = "low";
      if (daysSinceLastComm === null || daysSinceLastComm > 90) {
        riskLevel = "high";
      } else if (daysSinceLastComm > 30) {
        riskLevel = "medium";
      }

      const response: ApiResponse = {
        success: true,
        data: {
          client: {
            id: client.id,
            name: client.name,
            identifier: client.identifier,
            emailDomain: client.emailDomain,
          },
          summary: {
            totalDocuments: documentCount,
            totalChunks: chunkCount,
            totalQueries: queryCount,
            lastCommunicationDate: lastCommunication?.sourceDate ?? null,
            lastCommunicationSubject: lastCommunication?.filename ?? null,
            daysSinceLastCommunication: daysSinceLastComm,
            riskLevel,
          },
          recentDocuments: recentDocs,
          recentQueries,
          documentBreakdown: {
            ready: readyDocs,
            error: errorDocs,
          },
        },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);
