# Current Implementation State

**Last Updated:** 26 February 2026 (10:45 UTC)  
**Status:** Sync Page + Email Drafts Complete — All Core MVP Features Shipped

---

## Overview

The monorepo has **full database schema** and **API route scaffolding** complete. Postgres (pgvector-enabled) is migrated with 8 tables, seeded with demo data, and all REST endpoints are wired up with proper error handling, validation, and multi-tenancy isolation.

### Quick Status

- ✅ **Monorepo Structure:** pnpm + Turborepo configured, all workspaces linked
- ✅ **API Server:** Express.js with health + auth + documents + chat + sync routes on :4000
- ✅ **Web Frontend:** Next.js 14 with Tailwind CSS, landing page with API connectivity test on :3000
- ✅ **Shared Types:** Domain model + Zod validation schemas defined
- ✅ **Database:** Postgres 16 + pgvector with RLS, 8 tables (firms, users, clients, documents, chunks, queries, audit_logs, sync_jobs)
- ✅ **Migrations:** Applied + seeded with demo firm/users/clients
- ✅ **Authentication:** Google OAuth + JWT fully wired; AES-256-GCM refresh token encryption in place
- ✅ **Vitest Test Suite:** 121 tests passing (auth lib, auth middleware, Zod schemas, chunker, extractor, embedder, rag)
- ✅ **BullMQ Sync Workers:** Gmail + Drive workers wired end-to-end; jobs enqueued, processed, DB status updated
- ✅ **Text Extraction & Chunking:** PDF/DOCX/XLSX/plain-text extraction + sentence-aware chunking; extraction worker wired end-to-end
- ✅ **Embedding Pipeline:** OpenAI text-embedding-3-small; batch embedding worker wired end-to-end; vectors stored via raw SQL into pgvector
- ✅ **RAG Chat Endpoint:** `POST /api/chat` fully live — vector search, recency weighting, GPT-4o-mini, Query record storage, ChatSource citations
- ✅ **Web UI:** Next.js 14 App Router — Auth flow, Chat interface, Documents dashboard, Sync page, Email Drafts, protected layout
- ✅ **Email Drafts:** `POST /api/drafts` + `POST /api/drafts/refine` — RAG-grounded AI email drafting, stateless refinement loop

---

## Completed Work

### Package Infrastructure

| Package                 | Status  | Purpose                                                                              |
| ----------------------- | ------- | ------------------------------------------------------------------------------------ |
| `@ai-accounting/shared` | ✅ Live | TypeScript types + Zod validation schemas, exported from barrel file                 |
| `@ai-accounting/api`    | ✅ Live | Express server, 5 routers (health/auth/docs/chat/sync), error handler, Prisma client |
| `@ai-accounting/web`    | ✅ Live | Next.js app, landing page, Tailwind CSS setup, API health check UI                   |

### Database & ORM

- **Prisma 6.19.2** installed with @prisma/client
- **8 tables** created with pgvector support: `firms`, `users`, `clients`, `documents`, `chunks`, `queries`, `audit_logs`, `sync_jobs`
- **RLS policies** enabled on all tables via `firm_id` partition key
- **Migrations** applied successfully against local Postgres 16 + pgvector
- **Seed data** created: 1 firm (Sharma & Associates), 2 users (admin + member), 2 clients

### API Routes (5 Routers)

| Router         | Mounted At       | Status        | Endpoints                                                            |
| -------------- | ---------------- | ------------- | -------------------------------------------------------------------- |
| `health.ts`    | `/api/health`    | ✅ Live       | `GET /` — service status                                             |
| `auth.ts`      | `/api/auth`      | ✅ Live       | `GET /google`, `GET /google/callback`, `POST /logout`, `GET /me`     |
| `documents.ts` | `/api/documents` | ✅ Scaffolded | `GET /` (list, paginated), `GET /:id`, `POST /upload`, `DELETE /:id` |
| `chat.ts`      | `/api/chat`      | ✅ Live       | `POST /` (RAG query), `GET /history`, `POST /:queryId/feedback`      |
| `sync.ts`      | `/api/sync`      | ✅ Live       | `POST /gmail`, `POST /drive`, `GET /status`, `POST /cancel/:jobId`   |
| `drafts.ts`    | `/api/drafts`    | ✅ Live       | `POST /` (generate draft), `POST /refine` (iterate draft)            |

### Utilities & Middleware

- **Prisma singleton** — safe hot-reload pattern
- **ApiError class** — typed HTTP errors with factory methods
- **Zod validation middleware** — request body schema checking
- **Auth middleware** — real JWT verification + dev bypass via `X-Dev-User` header
- **Error handler** — global error-to-ApiResponse envelope

### Vitest Test Suite

- **`packages/shared/vitest.config.ts`** + **`apps/api/vitest.config.ts`** — Vitest configured in both packages
- **`packages/shared/src/schemas.test.ts`** — 38 tests covering all 6 Zod schemas (valid, defaults, coercion, boundary values)
- **`apps/api/src/lib/auth.test.ts`** — 22 tests for `encrypt`/`decrypt`, `signJwt`/`verifyJwt`, `buildGoogleAuthUrl`
- **`apps/api/src/middleware/auth.test.ts`** — 11 tests for `requireAuth` (dev bypass, JWT, expired) and `requireAdmin` (roles)
- **`apps/api/src/lib/chunker.test.ts`** — 11 tests for `chunkText` (empty input, sequential index, token cap, overlap, infinite-loop guard)
- **`apps/api/src/lib/extractor.test.ts`** — 13 tests for `extractText` (plain text, CRLF, XLSX, DOCX error-handling, textHash determinism)
- **`apps/api/src/lib/embedder.test.ts`** — 8 tests for `embedChunks` (empty input, batch size 100, 150-chunk split, order preservation, API call shape, error propagation) — OpenAI mocked via `vi.hoisted` + `vi.mock`
- **`apps/api/src/lib/rag.test.ts`** — 18 tests for `searchChunks` (threshold filtering, recency weighting, score sorting, limit, field mapping, age-0 and age-365 score invariants) and `generateRagAnswer` (JSON parsing, fallback on invalid JSON, token/cost calculation, follow-up capping, context injection)
- **`turbo.json`** — `test` task added with `dependsOn: ["^build"]`
- **Total: 121 tests, all green** (83 API + 38 shared)

### Embedding Pipeline

- **`apps/api/src/lib/embedder.ts`** — `embedChunks(chunks)` batches up to 100 items/call to `text-embedding-3-small` (1536 dims); lazy OpenAI client instantiated on first use; returns `{ chunkId, embedding }[]`; constants `EMBEDDING_MODEL` + `EMBEDDING_DIMENSIONS` exported for reuse
- **`apps/api/src/queues/embedding.queue.ts`** — `embeddingQueue` + `addEmbeddingJob()`; job ID locked to `embed:<documentId>` to prevent duplicates on retry; 3 attempts, 15s exponential backoff
- **`apps/api/src/workers/embedding.worker.ts`** — loads unembedded chunks via raw SQL (skips already-embedded on retry) → calls `embedChunks()` → stores each vector via `$executeRaw` (`UPDATE chunks SET embedding = $1::vector`) → concurrency 1 to respect OpenAI RPM
- **`apps/api/src/workers/extraction.worker.ts`** — updated to call `addEmbeddingJob({ documentId, firmId })` after marking document `status: "ready"`
- **`apps/api/src/index.ts`** — starts `startEmbeddingWorker()` on server boot

### Web UI

- **`apps/web/src/lib/api.ts`** — `apiFetch<T>(path, options)` typed fetch wrapper; `getToken/setToken/clearToken` helpers reading/writing JWT from `localStorage`
- **`apps/web/src/contexts/user-context.tsx`** — `UserProvider` + `useUser()` hook; fetches `/api/auth/me` on mount; handles `logout()` (clears token + redirects)
- **`apps/web/src/components/app-nav.tsx`** — fixed 224px sidebar: firm name + role, Chat/Documents/Sync/Drafts nav links, user avatar + sign-out button
- **`apps/web/src/app/layout.tsx`** — root layout wraps all pages in `<UserProvider>`; `lib: ["ES2022","DOM","DOM.Iterable"]` added to `tsconfig.json`
- **`apps/web/src/app/page.tsx`** — root redirect: `→ /chat` (authenticated) or `→ /sign-in` (unauthenticated)
- **`apps/web/src/app/sign-in/page.tsx`** — centered sign-in card with Google OAuth button (`href=/api/auth/google`)
- **`apps/web/src/app/auth/callback/page.tsx`** — reads `?token=` param (via `useSearchParams` + `<Suspense>`), stores JWT, redirects to `/chat`
- **`apps/web/src/app/auth/error/page.tsx`** — shows human-readable error message keyed by `?reason=` param
- **`apps/web/src/app/(app)/layout.tsx`** — protected layout; auth-guards all `/chat` + `/documents` routes; shows `<AppNav>` + main content
- **`apps/web/src/app/(app)/chat/page.tsx`** — full RAG chat interface: history sidebar (30 recent queries), message thread (user/assistant/error bubbles), expandable source citations, suggested follow-up chips, auto-resizing textarea, starter suggestions, thinking indicator
- **`apps/web/src/app/(app)/documents/page.tsx`** — documents dashboard: sync Gmail/Drive buttons with loading state, active-sync banner (5s polling), inline sync result messages, filterable table (source + status), status badges with colors, pagination
- **`apps/web/src/app/(app)/sync/page.tsx`** — sync control centre: Gmail + Drive action cards, auto-polling jobs table (5 s interval, stops when all inactive), status badges with animated running indicator, duration column, per-job Cancel button
- **`apps/web/src/app/(app)/drafts/page.tsx`** — AI email drafting: instruction textarea + client-ID filter + context toggle → `POST /api/drafts`; draft rendered in editable subject+body fields; Refine panel → `POST /api/drafts/refine`; Context Sources accordion; Copy-to-clipboard button with cost/latency metadata

### Email Drafts

- **`packages/shared/src/types.ts`** — added `DraftResponse` interface: `{ subject, draftText, sources: ChatSource[], metadata: { model, tokensPrompt, tokensCompletion, costEstimateInr, latencyMs } }`
- **`apps/api/src/routes/drafts.ts`** — stateless draft generation + refinement:
  - `POST /api/drafts`: validates `draftEmailSchema` → optional `searchChunks(instructions, firmId, { limit:5, threshold:0.65 })` for context → GPT-4o-mini `response_format: json_object` → returns `DraftResponse`
  - `POST /api/drafts/refine`: validates `refineDraftSchema` (takes existing `draftText` + new `instructions`) → GPT-4o-mini revision → returns refined `DraftResponse`
  - INR cost calculation: `(promptTokens × 0.15 + completionTokens × 0.6) / 1_000_000 × 83.5`
- **`apps/api/src/app.ts`** — mounted `draftsRouter` at `/api/drafts`

### RAG Chat Endpoint

- **`apps/api/src/lib/rag.ts`** — `searchChunks(query, firmId, options)`: embeds query → pgvector cosine distance ORDER BY with RETRIEVAL_LIMIT=20, threshold filter (0.72) in JS, recency weighting (`score = similarity × 1/(1 + ageDays/365)`), returns top-K `SearchResult[]`; `generateRagAnswer(query, chunks)`: GPT-4o-mini with `response_format: json_object`, system prompt adapts to no-context case, returns `{answer, suggestedFollowups, model, tokensPrompt, tokensCompletion, costInr}`
- **`apps/api/src/routes/chat.ts`** — `POST /` fully wired: `searchChunks` → `generateRagAnswer` → `buildChatSources` (dedup by documentId) → `prisma.query.create` (stores retrievedChunkIds, tokens, latency, costInr) → returns `ChatResponse`; `GET /history` and `POST /:queryId/feedback` remain as scaffolded
- **Constants exported:** `SIMILARITY_THRESHOLD = 0.72`, `DEFAULT_LIMIT = 8`, `RECENCY_SCALE_DAYS = 365`, `CHAT_MODEL = "gpt-4o-mini"`

### Text Extraction & Chunking

- **`apps/api/src/lib/extractor.ts`** — `extractText(buffer, mimeType)` supporting PDF (`PDFParse` class from pdf-parse v2), DOCX/DOC (mammoth), XLSX/XLS/CSV (xlsx → CSV), and `text/*` plain text; normalizes whitespace; returns `{ text, textHash }` (SHA-256 hex)
- **`apps/api/src/lib/chunker.ts`** — `chunkText(text)` sentence-aware chunker; 900-token target, 1200-token cap, 200-token overlap between chunks; `~4 chars/token` approximation; returns `ChunkInput[]` with `chunkText`, `tokenCount`, `chunkIndex`
- **`apps/api/src/queues/extraction.queue.ts`** — `extractionQueue` (BullMQ Queue) + `addExtractionJob()`; job ID locked to `extract:<documentId>` to prevent duplicate extraction; 3 retries with exponential backoff
- **`apps/api/src/workers/extraction.worker.ts`** — full extraction processor: decrypts refresh token → downloads content (Gmail: `messages.get` full; Drive: `files.get` media / `files.export` for Workspace formats) → `extractText()` → dedup by `textHash` → `chunkText()` → `chunk.createMany()` → sets document `status: "ready"`
- **`apps/api/src/workers/gmail-sync.worker.ts`** — updated to capture `document.create` return value and enqueue extraction job immediately after
- **`apps/api/src/workers/drive-sync.worker.ts`** — same pattern
- **`apps/api/src/index.ts`** — starts `startExtractionWorker()` alongside sync workers

### BullMQ Sync Workers

- **`apps/api/src/lib/redis.ts`** — ioredis singleton with `maxRetriesPerRequest: null` (required by BullMQ); separate `getRedisSubscriber()` for pub/sub
- **`apps/api/src/queues/sync.queue.ts`** — `syncQueue` (BullMQ Queue), `addGmailSyncJob()` + `addDriveSyncJob()` helpers; BullMQ Job ID = DB SyncJob UUID for direct correlation; 3 retry attempts with exponential backoff
- **`apps/api/src/workers/gmail-sync.worker.ts`** — full Gmail processor: decrypts refresh token → OAuth2 client → `messages.list` → extract text from MIME parts → SHA-256 hash → `document.upsert` → updates SyncJob status (running → completed/failed)
- **`apps/api/src/workers/drive-sync.worker.ts`** — full Drive processor: same DB tracking pattern → `files.list` with MIME type filter → `files.get` media stream → hash → Document upsert with `s3Key` placeholder
- **`apps/api/src/routes/sync.ts`** — updated `POST /gmail` and `POST /drive` to enqueue BullMQ jobs after creating DB SyncJob record; returns `{ jobId, bullJobId, type, status }`
- **`apps/api/src/index.ts`** — calls `startGmailSyncWorker()` + `startDriveSyncWorker()` on server boot

### Authentication

- **`src/lib/auth.ts`** — core auth service:
  - `buildGoogleAuthUrl()` — generates OAuth consent URL with offline access + email/profile/gmail/drive scopes
  - `exchangeCodeForTokens()` — exchanges authorization code for Google access + refresh tokens
  - `fetchGoogleProfile()` — fetches email, name, picture from Google userinfo API
  - `encrypt()` / `decrypt()` — AES-256-GCM with random 12-byte IV per token, stored as base64
  - `signJwt()` / `verifyJwt()` — JWT session tokens (15m expiry, issuer + audience validated)
- **`src/routes/auth.ts`** — full OAuth flow:
  - `GET /google` → redirects to Google consent screen
  - `GET /google/callback` → exchanges code, upserts User+Firm in DB, issues JWT, redirects to frontend
  - `POST /logout` → stateless (JWT dropped client-side; Redis blacklist planned)
  - `GET /me` → returns full user + firm from DB
- **`.env`** — `JWT_SECRET` (64-byte) and `ENCRYPTION_KEY` (32-byte) generated and in place
- **`.env.example`** — updated with generation commands and inline documentation

### Tooling & DevOps

- **pnpm workspace** with 3 packages configured
- **Turborepo** with task orchestration: `build`, `dev`, `typecheck`, `clean`
- **TypeScript 5.7** with strict mode, composite project references
- **Docker Compose** with Postgres (pgvector), Redis, API, Web services
- **DB scripts** added: `db:migrate`, `db:seed`, `db:studio`, `db:reset`
- **Prisma generate** integrated into build pipeline
- **All 3 packages build & typecheck clean**

---

## In-Progress / Pending

### Remaining MVP Work

1. **Production Hardening** — Redis JWT blacklist for logout, rate limiting, proper `HttpOnly` cookie auth (replace localStorage), HTTPS config
2. **OCR Fallback** — `tesseract.js` for scanned PDF images
3. **ESLint + Prettier** — code quality tooling across all packages
4. **Gmail Send Integration** — hook Drafts page "Save to Gmail" button up to Gmail Drafts API

---

## Architecture Decisions Made

- **Shared Types First:** All domain models live in `packages/shared`, never duplicated
- **Express Explicit Typing:** Prevents TS2742 "not portable" errors
- **Standalone Next.js:** `output: "standalone"` for clean Docker builds
- **Multi-Tenancy Default:** `firmId` on every entity, RLS enforced at DB level
- **Async-First Jobs:** Heavy work (sync, embedding) via BullMQ, not request handlers
- **LLM Provider Swappable:** Abstract behind service interfaces (not hardcoded OpenAI)
- **AES-256-GCM Encryption:** Google refresh tokens encrypted per-user with IV
- **Prisma + pgvector:** Native vector support for embeddings, no separate vector DB

---

## Known Issues & Blockers

| Issue                                  | Impact                                | Resolution                                               | Status    |
| -------------------------------------- | ------------------------------------- | -------------------------------------------------------- | --------- |
| JWT stored in localStorage             | Vulnerable to XSS in production       | Move to `HttpOnly` cookie via `/api/auth/token` endpoint | 🟡 Dev OK |
| Logout doesn't blacklist JWT           | Old token valid until expiry (15 min) | Add Redis blacklist in auth service                      | 🟡 Dev OK |
| Dev auth header `X-Dev-User` hardcoded | Development only, OK for MVP          | Production auth handled by real JWT                      | ✅ OK     |

---

## Key Metrics

| Metric                             | Value                                                 |
| ---------------------------------- | ----------------------------------------------------- |
| **Packages**                       | 3 (api, web, shared)                                  |
| **TypeScript Files**               | ~40 (routes, middleware, utilities)                   |
| **Database Tables**                | 8 with RLS enabled                                    |
| **REST Endpoints**                 | 19 (health + auth + documents + chat + sync + drafts) |
| **Zod Schemas**                    | 10 validation schemas                                 |
| **Total LOC** (excl. node_modules) | ~2500                                                 |
| **Build Time** (from cold)         | ~8 seconds (Turbo cached)                             |
| **Dev Time (hot reload)**          | Express ~200ms, Next.js ~500ms                        |
| **Container Images**               | 2 (api, web) + 2 infra (postgres, redis)              |
| **Port Usage**                     | API :4000, Web :3000, Postgres :5432, Redis :6379     |

---

## Dependencies Inventory

### Production

- **API:** express, cors, helmet, morgan, zod, dotenv, prisma, @prisma/client, jsonwebtoken, googleapis, bullmq, ioredis, pdf-parse, mammoth, xlsx, openai
- **Web:** next, react, react-dom
- **Shared:** zod

### Dev

- **All:** typescript, turbo, pnpm
- **API:** @types/express, @types/node, @types/jsonwebtoken, tsx, prisma
- **Web:** tailwindcss, autoprefixer, postcss, @types/react

### Planned (Next Sprint)

- **API:** tesseract.js (OCR fallback)
- **Web:** @tanstack/react-query, zustand, react-hook-form, framer-motion
- **All:** eslint, prettier

---

## Next Immediate Steps (Order of Execution)

1. **Production Auth** — move JWT from localStorage to `HttpOnly` `Set-Cookie` header; add Redis blacklist for logout
2. **Gmail Send Integration** — wire Drafts page "Save to Gmail" button via `POST /api/drafts/:id/send` using user's Google refresh token + Gmail Drafts API
3. **ESLint + Prettier** — add to all packages for consistent code style
4. **Docker Compose validation** — run `docker compose up --build` end-to-end smoke test
5. **OCR fallback** — `tesseract.js` for scanned PDF images that return no text from pdf-parse

---

## How to Update This File

**When:** After completing a major feature or milestone  
**What:** Update the relevant section:

- Move item from "Pending" to "Completed Work"
- Update "Known Issues" if resolved
- Update timestamps and status badges
- Add new pending items if scope expanded

**Trigger events:**

- ✅ Auth flow complete → Completed Work + next items
- ✅ Prisma schema created → Completed Work + blockers cleared
- ✅ First sync job working → Completed Work + Medium Priority updated
- 🔴 Blocker encountered → Add to Known Issues

---

## References

- **Architecture Details:** [architecture.md](../architecture.md)
- **Product Requirements:** [PRD.md](../PRD.md)
- **Development Guide:** [copilot-instructions.md](./copilot-instructions.md)
- **Database:** Prisma docs at https://www.prisma.io/docs/
- **Google APIs:** Use `googleapis` or `@google-cloud/gmail` packages
- **OpenAI:** Use official `openai` package (GPT-4o-mini + text-embedding-3-small)
- **Redis/BullMQ:** Use `bullmq` + `redis` packages for job queue
