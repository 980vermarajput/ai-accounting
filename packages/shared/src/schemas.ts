import { z } from "zod";

// ─── Auth Schemas ────────────────────────────────────

export const googleCallbackSchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
  state: z.string().optional(),
});
export type GoogleCallbackInput = z.infer<typeof googleCallbackSchema>;

// ─── Document Schemas ────────────────────────────────

export const documentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  source: z.enum(["gmail", "drive", "upload"]).optional(),
  clientId: z.string().uuid().optional(),
  status: z.enum(["pending", "processing", "ready", "error"]).optional(),
});
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

// ─── Chat / RAG Schemas ─────────────────────────────

export const chatRequestSchema = z.object({
  clientId: z.string().uuid().optional(),
  query: z.string().min(1, "Query cannot be empty").max(5000, "Query too long"),
  filters: z
    .object({
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
      source: z.array(z.enum(["gmail", "drive", "upload"])).optional(),
    })
    .optional(),
});
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

export const feedbackSchema = z.object({
  feedback: z.enum(["positive", "negative", "none"]),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

// ─── Sync Schemas ────────────────────────────────────

export const syncCancelSchema = z.object({
  jobId: z.string().uuid(),
});
export type SyncCancelInput = z.infer<typeof syncCancelSchema>;

// ─── Client Schemas ──────────────────────────────────

export const createClientSchema = z.object({
  name: z.string().min(1).max(255),
  identifier: z.string().min(1).max(100),
  emailDomain: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

// ─── Admin Schemas ───────────────────────────────────

export const inviteUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member"]).default("member"),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

// ─── Draft Email Schemas ─────────────────────────────

export const draftEmailSchema = z.object({
  clientId: z.string().uuid().optional(),
  threadId: z.string().optional(),
  instructions: z.string().min(1).max(2000),
  includeContext: z.boolean().default(true),
});
export type DraftEmailInput = z.infer<typeof draftEmailSchema>;

export const refineDraftSchema = z.object({
  draftText: z.string().min(1),
  instructions: z.string().min(1).max(2000),
});
export type RefineDraftInput = z.infer<typeof refineDraftSchema>;
