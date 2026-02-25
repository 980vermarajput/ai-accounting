# Current Implementation State

**Last Updated:** 25 February 2026 (10:00 UTC)  
**Status:** Database + API Routes Complete — Ready for Authentication & RAG Pipeline

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
- ⏳ **Authentication:** Google OAuth routes scaffolded, JWT/token logic not yet implemented

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
| `auth.ts`      | `/api/auth`      | ✅ Scaffolded | `GET /google`, `GET /google/callback`, `POST /logout`, `GET /me`     |
| `documents.ts` | `/api/documents` | ✅ Scaffolded | `GET /` (list, paginated), `GET /:id`, `POST /upload`, `DELETE /:id` |
| `chat.ts`      | `/api/chat`      | ✅ Scaffolded | `POST /` (RAG query), `GET /history`, `POST /:queryId/feedback`      |
| `sync.ts`      | `/api/sync`      | ✅ Scaffolded | `POST /gmail`, `POST /drive`, `GET /status`, `POST /cancel/:jobId`   |

### Utilities & Middleware

- **Prisma singleton** — safe hot-reload pattern
- **ApiError class** — typed HTTP errors with factory methods
- **Zod validation middleware** — request body schema checking
- **Auth middleware** — JWT stub + dev bypass via `X-Dev-User` header
- **Error handler** — global error-to-ApiResponse envelope

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

1. **Authentication (Google OAuth + JWT)**
   - Implement real Google OAuth token exchange (PKCE)
   - Add jsonwebtoken for JWT issuance/verification
   - Encrypt Google refresh tokens with AES-256-GCM
   - **Estimated:** 4–5 hours | **Blocked by:** None

2. **Document Sync Workers** (BullMQ + Redis)
   - Gmail sync processor — fetch messages, extract text, store in S3
   - Drive sync processor — list files, download, extract text
   - **Estimated:** 6–8 hours | **Blocked by:** Auth

3. **Text Extraction & Chunking**
   - PDF, DOCX, XLSX parsers with OCR fallback
   - Text normalization + SHA-256 dedup
   - Sentence-aware chunking (800–1200 tokens, 200 overlap)
   - **Estimated:** 5–6 hours | **Blocked by:** Sync workers

4. **Embedding Pipeline**
   - OpenAI text-embedding-3-small integration
   - Batch embedding creation (1536-dim vectors)
   - Vector insert into pgvector `chunks.embedding` column
   - **Estimated:** 3–4 hours | **Blocked by:** Chunking

5. **RAG Chat Endpoint**
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

| Issue                                       | Impact                       | Resolution                                     | Status  |
| ------------------------------------------- | ---------------------------- | ---------------------------------------------- | ------- |
| No real JWT verification in auth middleware | Can't validate real tokens   | Implement JWT verify with jsonwebtoken package | 🔴 TODO |
| No Google OAuth token exchange implemented  | Can't authenticate users     | Implement OAuth 2.0 PKCE flow                  | 🔴 TODO |
| Google tokens not encrypted (AES-256-GCM)   | Security risk                | Implement encryption/decryption in auth routes | 🔴 TODO |
| No sync workers (BullMQ)                    | Can't process Gmail/Drive    | Implement BullMQ job processors                | 🔴 TODO |
| No text extraction / chunking               | Can't process documents      | Add pdf-parse, docx-parse, xlsx packages       | 🔴 TODO |
| No embedding generation (OpenAI)            | Can't vectorize chunks       | Integrate OpenAI text-embedding-3-small        | 🔴 TODO |
| No RAG vector search                        | Chat endpoint non-functional | Implement pgvector similarity search           | 🔴 TODO |
| Dev auth header `X-Dev-User` hardcoded      | Development only, OK for MVP | Production auth handled by real JWT            | ✅ OK   |

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

- **API:** express, cors, helmet, morgan, zod, dotenv, prisma, @prisma/client
- **Web:** next, react, react-dom
- **Shared:** zod

### Dev

- **All:** typescript, turbo, pnpm
- **API:** @types/express, @types/node, tsx, prisma
- **Web:** tailwindcss, autoprefixer, postcss, @types/react

### Planned (Next Sprint)

- **API:** bullmq, redis, jsonwebtoken, openai, @google-cloud/gmail, googleapis, pdf-parse, docx-parse, xlsx, tesseract.js, aws-sdk
- **Web:** @tanstack/react-query, zustand, react-hook-form, framer-motion
- **All:** eslint, prettier

---

## Next Immediate Steps (Order of Execution)

1. **Implement Google OAuth** — token exchange, JWT issuance, encryption of refresh tokens
2. **Add jsonwebtoken** — JWT sign/verify for session management
3. **Test auth flow** — POST to `/api/auth/google/callback` with real OAuth code
4. **Install BullMQ + Redis client** — set up job queue infrastructure
5. **Build Gmail sync worker** — fetch messages, extract attachments, store metadata in DB
6. **Build Drive sync worker** — fetch files, download, extract text
7. **Add text extraction packages** — pdf-parse, docx-parse, xlsx, Tesseract OCR
8. **Implement chunking service** — split normalized text into 800–1200 token chunks
9. **Wire OpenAI embedding** — batch embed chunks, store vectors in pgvector
10. **Implement RAG search** — vector similarity + recency weighting + LLM prompt assembly

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
