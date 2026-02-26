import { Router, Request, Response, NextFunction } from "express";
import type {
  ApiResponse,
  PaginatedResponse,
  Document,
} from "@ai-accounting/shared";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/api-error";

export const documentsRouter: Router = Router();

// All document routes require authentication
documentsRouter.use(requireAuth);

// ─── GET /api/documents — list documents with filters ────────────
documentsRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        page = "1",
        pageSize = "20",
        source,
        clientId,
        status,
      } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const size = Math.min(
        100,
        Math.max(1, parseInt(pageSize as string, 10) || 20),
      );

      const where: Record<string, unknown> = { firmId: req.user!.firmId };
      if (source) where.source = source;
      if (clientId) where.clientId = clientId;
      if (status) where.status = status;

      const [documents, total] = await Promise.all([
        prisma.document.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (pageNum - 1) * size,
          take: size,
        }),
        prisma.document.count({ where }),
      ]);

      const response: PaginatedResponse<Document> = {
        success: true,
        data: documents as unknown as Document[],
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

// ─── GET /api/documents/:id — document detail + chunk count ──────
documentsRouter.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const docId = String(req.params.id);
      const doc = await prisma.document.findFirst({
        where: { id: docId, firmId: req.user!.firmId },
      });

      if (!doc) throw ApiError.notFound("Document not found");

      const chunkCount = await prisma.chunk.count({
        where: { documentId: doc.id },
      });

      const response: ApiResponse = {
        success: true,
        data: { ...doc, chunkCount },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/documents/upload — manual file upload ─────────────
documentsRouter.post(
  "/upload",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // TODO: handle multipart upload (multer), extract text, store in S3
      const response: ApiResponse = {
        success: false,
        error: {
          code: "NOT_IMPLEMENTED",
          message: "File upload not yet implemented",
        },
      };
      res.status(501).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /api/documents — clear ALL documents for this firm ───
documentsRouter.delete(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.user!;

      // Delete all documents for the firm (chunks cascade via DB relation)
      const { count } = await prisma.document.deleteMany({ where: { firmId } });

      // Clear the firm knowledge snapshot since all docs are gone
      await prisma.firm.update({
        where: { id: firmId },
        data: { knowledgeSnapshot: null },
      });

      const response: ApiResponse = {
        success: true,
        data: {
          message: `Deleted ${count} document(s) and cleared knowledge snapshot`,
          count,
        },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /api/documents/:id — delete document + chunks ────────
documentsRouter.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const docId = String(req.params.id);
      const doc = await prisma.document.findFirst({
        where: { id: docId, firmId: req.user!.firmId },
      });

      if (!doc) throw ApiError.notFound("Document not found");

      // Cascade deletes chunks (via Prisma relation onDelete: Cascade)
      await prisma.document.delete({ where: { id: doc.id } });

      // TODO: also delete from S3

      const response: ApiResponse = {
        success: true,
        data: { message: "Document deleted", id: doc.id },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);
