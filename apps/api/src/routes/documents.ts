import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import type {
  ApiResponse,
  PaginatedResponse,
  Document,
  ThreadSummaryResponse,
} from "@ai-accounting/shared";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limiter";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/api-error";
import { extractText } from "../lib/extractor";
import { chunkText } from "../lib/chunker";
import { addEmbeddingJob } from "../queues/embedding.queue";

export const documentsRouter: Router = Router();

// All document routes require authentication + rate limiting
documentsRouter.use(requireAuth);
documentsRouter.use(rateLimit);

// ─── Multer configuration ────────────────────────────────────────
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new ApiError(
          400,
          "INVALID_FILE_TYPE",
          `Unsupported file type: ${file.mimetype}. Allowed: PDF, DOCX, XLSX, CSV, TXT`,
        ),
      );
    }
  },
});

// ─── GET /api/documents — list documents with filters ────────────
documentsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = "1", pageSize = "20", source, clientId, status } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize as string, 10) || 20));

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
});

// ─── GET /api/documents/:id — document detail + chunk count ──────
documentsRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
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
});

// ─── POST /api/documents/upload — manual file upload ─────────────
documentsRouter.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file;
      if (!file) {
        throw ApiError.badRequest("No file provided — send as multipart 'file' field");
      }

      const { userId, firmId } = req.user!;
      const clientId = req.body.clientId as string | undefined;

      // 1. Extract text from the uploaded buffer
      const { text, textHash } = await extractText(file.buffer, file.mimetype);

      if (!text || text.trim().length === 0) {
        throw ApiError.badRequest(
          "No text could be extracted from this file. It may be empty or contain only images.",
        );
      }

      // 2. Check for duplicate (same text hash in this firm)
      const existing = await prisma.document.findFirst({
        where: { firmId, textHash },
        select: { id: true, filename: true },
      });
      if (existing) {
        throw ApiError.conflict(
          `Duplicate document — same content already uploaded as "${existing.filename}"`,
        );
      }

      // 3. Create the document record
      const doc = await prisma.document.create({
        data: {
          firmId,
          userId,
          clientId: clientId ?? null,
          source: "upload",
          sourceId: `upload-${crypto.randomUUID()}`,
          filename: file.originalname,
          mimeType: file.mimetype,
          s3Key: `uploads/${firmId}/${crypto.randomUUID()}-${file.originalname}`,
          textHash,
          textExcerpt: text.slice(0, 500),
          status: "processing",
          sourceDate: new Date(),
        },
      });

      // 4. Chunk the extracted text
      const chunks = chunkText(text);

      // 5. Store chunks in the database
      await prisma.chunk.createMany({
        data: chunks.map((c) => ({
          documentId: doc.id,
          firmId,
          clientId: clientId ?? null,
          chunkIndex: c.chunkIndex,
          chunkText: c.chunkText,
          tokenCount: c.tokenCount,
        })),
      });

      // 6. Mark document as ready and enqueue embedding
      await prisma.document.update({
        where: { id: doc.id },
        data: { status: "ready" },
      });

      await addEmbeddingJob({ documentId: doc.id, firmId });

      const response: ApiResponse = {
        success: true,
        data: {
          id: doc.id,
          filename: doc.filename,
          mimeType: doc.mimeType,
          status: "ready",
          chunksCreated: chunks.length,
          message: `File uploaded and processed — ${chunks.length} chunk(s) created, embedding queued.`,
        },
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/documents/thread/:threadId — Gmail thread summary ──
documentsRouter.get(
  "/thread/:threadId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const threadId = String(req.params.threadId);
      const { firmId } = req.user!;

      const documents = await prisma.document.findMany({
        where: { firmId, gmailThreadId: threadId },
        orderBy: { sourceDate: "asc" },
        select: {
          id: true,
          filename: true,
          sourceId: true,
          textExcerpt: true,
          sourceDate: true,
          status: true,
          summary: true,
        },
      });

      if (documents.length === 0) {
        throw ApiError.notFound(`No emails found for Gmail thread ${threadId}`);
      }

      const messages = documents.map((d) => ({
        id: d.id,
        filename: d.filename,
        sourceId: d.sourceId,
        textExcerpt: d.textExcerpt ?? "",
        sourceDate: d.sourceDate,
        status: d.status,
        summary: d.summary ?? undefined,
      }));

      const response: ApiResponse<ThreadSummaryResponse> = {
        success: true,
        data: {
          threadId,
          messageCount: messages.length,
          messages,
          dateRange: {
            earliest: messages[0].sourceDate,
            latest: messages[messages.length - 1].sourceDate,
          },
        },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /api/documents — clear ALL documents for this firm ───
documentsRouter.delete("/", async (req: Request, res: Response, next: NextFunction) => {
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
});

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
