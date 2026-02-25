// ─── Firm ────────────────────────────────────────────

export type Plan = "trial" | "starter" | "pro";

export interface Firm {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  stripeCustomerId?: string;
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
  filename: string;
  mimeType: string;
  s3Key: string;
  textHash: string;
  textExcerpt: string;
  status: DocumentStatus;
  errorMessage?: string;
  sourceDate: Date;
  createdAt: Date;
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

export interface ChatResponse {
  queryId: string;
  answer: string;
  sources: ChatSource[];
  suggestedFollowups: string[];
  metadata: {
    model: string;
    tokensPrompt: number;
    tokensCompletion: number;
    costEstimateInr: number;
    latencyMs: number;
    retrievalLatencyMs: number;
    chunksRetrieved: number;
    chunksUsed: number;
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
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
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
