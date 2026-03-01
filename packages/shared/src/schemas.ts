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
  sessionId: z.string().uuid().optional(), // Optional for new conversations
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

export const syncRequestSchema = z.object({
  keywords: z
    .array(z.string())
    .max(20, "Maximum 20 keywords allowed")
    .optional()
    .transform((val) => val?.map((k) => k.trim()).filter((k) => k.length > 0) || [])
    .pipe(z.array(z.string().min(1).max(100))),
  includeAllKeywords: z.boolean().default(true),
});
export type SyncRequestInput = z.infer<typeof syncRequestSchema>;

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

export const sendDraftSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  threadId: z.string().optional(),
});
export type SendDraftInput = z.infer<typeof sendDraftSchema>;

// ─── Deadline Schemas ────────────────────────────────

export const deadlineConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

export const deadlineListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  clientId: z.string().uuid().optional(),
  from: z.string().optional(), // ISO date YYYY-MM-DD
  to: z.string().optional(), // ISO date YYYY-MM-DD
  confidence: deadlineConfidenceSchema.optional(),
});
export type DeadlineListQuery = z.infer<typeof deadlineListQuerySchema>;

export const deadlineCalendarQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
  clientId: z.string().uuid().optional(),
});
export type DeadlineCalendarQuery = z.infer<typeof deadlineCalendarQuerySchema>;

export const extractedDeadlineSchema = z.object({
  id: z.string(),
  firmId: z.string(),
  documentId: z.string(),
  clientId: z.string().nullable().optional(),
  date: z.string(),
  description: z.string(),
  rawText: z.string(),
  confidence: deadlineConfidenceSchema,
  alertId: z.string().nullable().optional(),
  createdAt: z.string(),
  document: z.object({ id: z.string(), filename: z.string() }).optional(),
  client: z.object({ id: z.string(), name: z.string() }).optional(),
});

// ─── Dashboard / Alert Schemas ───────────────────────

export const alertTypeSchema = z.enum([
  "INVOICE_OVERDUE",
  "CLIENT_SILENT",
  "DEADLINE_DETECTED",
  "HIGH_RISK_LANGUAGE",
  "SYNC_FAILURE",
  "TOKEN_CAP_WARNING",
]);

export const severitySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const alertListQuerySchema = z.object({
  severity: severitySchema.optional(),
  unreadOnly: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AlertListQuery = z.infer<typeof alertListQuerySchema>;

export const alertSchema = z.object({
  id: z.string(),
  firmId: z.string(),
  clientId: z.string().nullable().optional(),
  type: alertTypeSchema,
  severity: severitySchema,
  title: z.string(),
  body: z.string(),
  metadata: z.record(z.unknown()).default({}),
  isRead: z.boolean(),
  resolvedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  expiresAt: z.string().nullable().optional(),
});

export const dailyBriefingSchema = z.object({
  id: z.string(),
  firmId: z.string(),
  date: z.string(),
  summary: z.string(),
  clientCount: z.number(),
  alertCount: z.number(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string(),
});

export const commandCentreResponseSchema = z.object({
  briefing: dailyBriefingSchema.nullable(),
  generatedNow: z.boolean(),
  alerts: z.array(alertSchema),
  unreadAlertCount: z.number(),
  clientsNeedingAttention: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      daysSinceLastDocument: z.number(),
      identifier: z.string(),
    }),
  ),
  recentActivity: z.array(
    z.object({
      clientId: z.string(),
      clientName: z.string(),
      documentCount: z.number(),
    }),
  ),
  tokenUsage: z.object({
    today: z.number(),
    cap: z.number(),
  }),
});

// ─── Team / Invite Schemas ───────────────────────────────────────────────────

export const createInviteSchema = z.object({
  email: z.string().email("Invalid email address").optional(),
  role: z.enum(["admin", "member"]).default("member"),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const invitePreviewSchema = z.object({
  firmName: z.string(),
  inviterName: z.string(),
  role: z.enum(["admin", "member"]),
  expiresAt: z.string(),
});
export type InvitePreviewOutput = z.infer<typeof invitePreviewSchema>;
