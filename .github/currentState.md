# Current Implementation State

**Last Updated:** 25 February 2026 (16:00 UTC)  
**Status:** BullMQ Sync Workers Complete — Ready for Text Extraction & Chunking

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
- ✅ **Vitest Test Suite:** 71 tests passing (auth lib, auth middleware, Zod schemas)
- ✅ **BullMQ Sync Workers:** Gmail + Drive workers wired end-to-end; jobs enqueued, processed, DB status updated

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
| `chat.ts`      | `/api/chat`      | ✅ Scaffolded | `POST /` (RAG query), `GET /history`, `POST /:queryId/feedback`      |
| `sync.ts`      | `/api/sync`      | ✅ Live        | `POST /gmail`, `POST /drive`, `GET /status`, `POST /cancel/:jobId`   |

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
- **`turbo.json`** — `test` task added with `dependsOn: ["^build"]`
- **Total: 71 tests, all green**

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

### High Priority (MVP Feature Work)

1. **Text Extraction & Chunking** ← **CURRENT PRIORITY**
   - PDF, DOCX, XLSX parsers with OCR fallback
   - Text normalization + SHA-256 dedup
   - Sentence-aware chunking (800–1200 tokens, 200 overlap)
   - **Estimated:** 5–6 hours | **Blocked by:** ~~Sync workers~~ ✅

2. **Embedding Pipeline**
   - OpenAI text-embedding-3-small integration
   - Batch embedding creation (1536-dim vectors)
   - Vector insert into pgvector `chunks.embedding` column
   - **Estimated:** 3–4 hours | **Blocked by:** Chunking

3. **RAG Chat Endpoint**
   - Vector similarity search + recency weighting
   - Prompt assembly with system message + top-K contexts
   - LLM integration (GPT-4o-mini)
   - Source citation extraction
   - **Estimated:** 4–5 hours | **Blocked by:** Embedding pipeline

### Medium Priority (UX / Polish)

6. **Web UI Components**
   - Chat interface with message history
   - Document management dashboard
   - Sync status indicators
   - Admin user management panel
   - **Estimated:** 8–10 hours | **Blocked by:** RAG endpoint

7. **Email Draft Feature**
   - Prompt template for professional CA tone
   - Refine endpoint (iterate on drafts)
   - Gmail integration for sending
   - **Estimated:** 3 hours | **Blocked by:** Auth + RAG

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

| Issue                                  | Impact                       | Resolution                               | Status  |
| -------------------------------------- | ---------------------------- | ---------------------------------------- | ------- |
| No text extraction / chunking          | Can't process documents      | Add pdf-parse, docx-parse, xlsx packages | 🔴 TODO |
| No embedding generation (OpenAI)       | Can't vectorize chunks       | Integrate OpenAI text-embedding-3-small  | 🔴 TODO |
| No RAG vector search                   | Chat endpoint non-functional | Implement pgvector similarity search     | 🔴 TODO |
| Dev auth header `X-Dev-User` hardcoded | Development only, OK for MVP | Production auth handled by real JWT      | ✅ OK   |

---

## Key Metrics

| Metric                             | Value                                             |
| ---------------------------------- | ------------------------------------------------- |
| **Packages**                       | 3 (api, web, shared)                              |
| **TypeScript Files**               | ~40 (routes, middleware, utilities)               |
| **Database Tables**                | 8 with RLS enabled                                |
| **REST Endpoints**                 | 17 (health + 16 scaffolded)                       |
| **Zod Schemas**                    | 10 validation schemas                             |
| **Total LOC** (excl. node_modules) | ~2500                                             |
| **Build Time** (from cold)         | ~8 seconds (Turbo cached)                         |
| **Dev Time (hot reload)**          | Express ~200ms, Next.js ~500ms                    |
| **Container Images**               | 2 (api, web) + 2 infra (postgres, redis)          |
| **Port Usage**                     | API :4000, Web :3000, Postgres :5432, Redis :6379 |

---

## Dependencies Inventory

### Production

- **API:** express, cors, helmet, morgan, zod, dotenv, prisma, @prisma/client, jsonwebtoken, googleapis, bullmq, ioredis
- **Web:** next, react, react-dom
- **Shared:** zod

### Dev

- **All:** typescript, turbo, pnpm
- **API:** @types/express, @types/node, @types/jsonwebtoken, tsx, prisma
- **Web:** tailwindcss, autoprefixer, postcss, @types/react

### Planned (Next Sprint)

- **API:** openai, pdf-parse, mammoth, xlsx, tesseract.js
- **Web:** @tanstack/react-query, zustand, react-hook-form, framer-motion
- **All:** eslint, prettier

---

## Next Immediate Steps (Order of Execution)

1. **Install text extraction packages** — `pdf-parse`, `mammoth` (DOCX), `xlsx`; add `@types/pdf-parse`
2. **Create `src/lib/extractor.ts`** — handles PDF → text, DOCX → text, XLSX → text/CSV, plain text pass-through; SHA-256 hash of content
3. **Create `src/lib/chunker.ts`** — sentence-aware chunking (800–1200 tokens, 200-token overlap), returns `{ chunkText, tokenCount, chunkIndex }[]`
4. **Integrate extraction into Gmail worker** — after `document.upsert` with `status: "pending"`, call extractor → chunker → insert rows into `chunks` table → set doc `status: "ready"`
5. **Integrate extraction into Drive worker** — same pipeline after downloading file content
6. **Install openai package** — add `OPENAI_API_KEY` to `.env.example`
7. **Create `src/lib/embedder.ts`** — batches chunks (100/call), calls `text-embedding-3-small` (1536 dims), stores vectors via raw SQL `UPDATE chunks SET embedding = $1::vector`
8. **Call embedder at end of extraction pipeline** — chunks inserted → batched embed → vectors stored
9. **Implement RAG vector search** — pgvector cosine similarity + recency weighting (`score = similarity × 1/(1 + age_days/365)`), top-K=8, threshold 0.72
10. **Wire `POST /api/chat`** — embed query → vector search → prompt assembly → GPT-4o-mini → store Query record with citations

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
