// ─── Firm ────────────────────────────────────────────

export type Plan = "trial" | "starter" | "pro";

export interface Firm {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  stripeCustomerId?: string;
  knowledgeSnapshot?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── User ────────────────────────────────────────────

export type UserRole = "admin" | "member";

export interface User {
  id: string;
  firmId: string;
  email: string;
  name: string;
  role: UserRole;
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Client ──────────────────────────────────────────

export interface Client {
  id: string;
  firmId: string;
  createdBy: string;
  name: string;
  identifier: string;
  emailDomain?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ─── Document ────────────────────────────────────────

export type DocumentSource = "gmail" | "drive" | "upload";
export type DocumentStatus = "pending" | "processing" | "ready" | "error";

export interface Document {
  id: string;
  firmId: string;
  userId: string;
  clientId?: string;
  source: DocumentSource;
  sourceId: string;
  gmailThreadId?: string;
  filename: string;
  mimeType: string;
  s3Key: string;
  textHash: string;
  textExcerpt: string;
  status: DocumentStatus;
  errorMessage?: string;
  summary?: string;
  entities?: DocumentEntities;
  sourceDate: Date;
  createdAt: Date;
}

export interface DocumentEntities {
  clients: string[];
  amounts: string[];
  dates: string[];
  documentType?: string;
  gstNumbers?: string[];
  panNumbers?: string[];
}

// ─── Chat ────────────────────────────────────────────

export type Feedback = "positive" | "negative" | "none";

export interface ChatRequest {
  clientId?: string;
  query: string;
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    source?: DocumentSource[];
  };
}

export interface ChatSource {
  docId: string;
  filename: string;
  excerpt: string;
  link?: string;
  sourceDate: string;
  relevanceScore: number;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ConfidenceInfo {
  level: ConfidenceLevel;
  score: number;
}

export interface ChatResponse {
  queryId: string;
  answer: string;
  sources: ChatSource[];
  suggestedFollowups: string[];
  confidence: ConfidenceInfo;
  metadata: {
    model: string;
    tokensPrompt: number;
    tokensCompletion: number;
    costEstimateInr: number;
    latencyMs: number;
    retrievalLatencyMs: number;
    chunksRetrieved: number;
    chunksUsed: number;
    cached: boolean;
  };
}

// ─── Sync ────────────────────────────────────────────

export type SyncType = "gmail" | "drive";
export type SyncStatus = "queued" | "running" | "completed" | "failed";

export interface SyncJob {
  id: string;
  firmId: string;
  userId: string;
  type: SyncType;
  status: SyncStatus;
  documentsFound: number;
  documentsProcessed: number;
  keywords: string[];
  includeAllKeywords: boolean;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

// ─── Drafts ─────────────────────────────────────────

export interface DraftResponse {
  subject: string;
  draftText: string;
  sources: ChatSource[];
  metadata: {
    model: string;
    tokensPrompt: number;
    tokensCompletion: number;
    costEstimateInr: number;
    latencyMs: number;
  };
}

export interface GmailDraftResponse {
  gmailDraftId: string;
  gmailMessageId: string;
  threadId?: string;
}

// ─── Gmail Thread ────────────────────────────────────

export interface ThreadMessage {
  id: string;
  filename: string;
  sourceId: string;
  textExcerpt: string;
  sourceDate: Date;
  status: DocumentStatus;
  summary?: string;
}

export interface ThreadSummaryResponse {
  threadId: string;
  messageCount: number;
  messages: ThreadMessage[];
  dateRange: {
    earliest: Date;
    latest: Date;
  };
}

// ─── API Responses ───────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
