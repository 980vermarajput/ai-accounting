# Current Implementation State

**Last Updated:** 25 February 2026  
**Status:** MVP Foundation Complete — Ready for Feature Development

---

## Overview

The monorepo foundation is **fully functional** with dev infrastructure running. All three packages build, typecheck, and the app stack (Postgres + Redis + API + Web) is operational locally.

### Quick Status

- ✅ **Monorepo Structure:** pnpm + Turborepo configured, all workspaces linked
- ✅ **API Server:** Express.js with health check endpoint running on :4000
- ✅ **Web Frontend:** Next.js 14 with Tailwind CSS, landing page with API connectivity test on :3000
- ✅ **Shared Types:** Domain model defined (`Firm`, `User`, `Document`, `Chat`, `SyncJob`, `ApiResponse`)
- ✅ **Docker Setup:** `docker-compose.dev.yml` (infra only) + `docker-compose.yml` (full stack)
- ✅ **Environment:** `.env` files configured for local development
- ⏳ **Database:** Postgres schema not yet created (awaiting Prisma setup)
- ⏳ **Authentication:** Google OAuth scaffolding in PRD, not yet implemented

---

## Completed Work

### Package Infrastructure

| Package                 | Status  | Purpose                                                               |
| ----------------------- | ------- | --------------------------------------------------------------------- |
| `@ai-accounting/shared` | ✅ Live | TypeScript types, exports from `src/index.ts` barrel file             |
| `@ai-accounting/api`    | ✅ Live | Express server, health route, error-handler middleware, dotenv loader |
| `@ai-accounting/web`    | ✅ Live | Next.js app, landing page, Tailwind CSS setup, API health check UI    |

### Tooling & DevOps

- **pnpm workspace** with 3 packages configured
- **Turborepo** with task orchestration: `build` (shared→api→web order), `dev`, `typecheck`, `clean`
- **TypeScript 5.7** with strict mode, composite project references for build caching
- **Docker Compose** with Postgres (pgvector), Redis, API, Web services
- **GitHub Actions** hooks ready (CI/CD pipeline not yet configured)
- **ESM/CommonJS mix:** Shared (ESM), API (CommonJS), Web (ESM) — all interop correctly

### Code Quality

- All 3 packages **typecheck clean** (`pnpm typecheck` passes)
- **Express type safety:** Explicit `Express`, `Router` annotations to avoid TS2742 errors
- **React safety:** Proper typing in client components (`"use client"` directive)
- **Git workflow:** Initialized, `.gitignore` includes `node_modules`, `.next`, `dist`, Docker volumes

---

## In-Progress / Pending

### High Priority (MVP Foundation)

1. **Prisma ORM Setup**
   - Schema file with: `Firm`, `User`, `Document`, `Chunk`, `Query`, `AuditLog`, `SyncJob` tables
   - RLS (Row-Level Security) configuration for multi-tenancy
   - Migration scripts
   - Add to `apps/api` as dependency
   - **Estimated:** 2–3 hours

2. **Database Initialization**
   - Run migrations against local Postgres
   - Seed initial firm/user data for testing
   - **Estimated:** 1 hour

3. **Authentication (Google OAuth)**
   - NextAuth.js v5 setup in web + API routes
   - Callback handler to store encrypted refresh tokens (AES-256-GCM)
   - User session middleware
   - **Estimated:** 4–5 hours

4. **API Endpoint Scaffolding**
   - `/api/auth/*` routes (login, callback, logout, me)
   - `/api/documents` CRUD routes
   - Validation with Zod
   - **Estimated:** 3 hours

### Medium Priority (RAG Pipeline)

5. **Document Sync Workers** (BullMQ + Redis)
   - Gmail sync processor
   - Drive sync processor
   - Status tracking updates
   - **Estimated:** 6–8 hours

6. **Text Extraction & Chunking**
   - PDF, DOCX, XLSX parsers
   - Text normalization (remove boilerplate, dedup)
   - Sentence-aware chunking (800–1200 tokens, 200 overlap)
   - **Estimated:** 5–6 hours

7. **Embedding Pipeline**
   - OpenAI text-embedding-3-small integration
   - pgvector storage
   - Batch processing logic
   - **Estimated:** 3–4 hours

8. **RAG Chat Endpoint**
   - Vector search with similarity + recency ranking
   - Prompt assembly with system message + context
   - OpenAI GPT-4o-mini integration
   - Source citation extraction
   - **Estimated:** 4–5 hours

### Lower Priority (UX / Polish)

9. **Web UI Components**
   - Chat interface with message history
   - Document management dashboard
   - Sync status indicators
   - Admin user management
   - **Estimated:** 8–10 hours

10. **Email Draft Feature**
    - Prompt template for professional tone
    - Refine endpoint
    - Gmail integration for sending
    - **Estimated:** 3 hours

---

## Architecture Decisions Made

- **Shared Types First:** All domain models live in `packages/shared`, never duplicated
- **Express Explicit Typing:** Prevents TS2742 "not portable" errors
- **Standalone Next.js:** `output: "standalone"` for clean Docker builds
- **Multi-Tenancy Default:** `firmId` on every entity, RLS enforced at DB level
- **Async-First Jobs:** Heavy work (sync, embedding) via BullMQ, not request handlers
- **LLM Provider Swappable:** Abstract behind service interfaces (not hardcoded OpenAI)
- **AES-256-GCM Encryption:** Google refresh tokens encrypted per-user with IV

---

## Known Issues & Blockers

| Issue                                             | Impact                     | Resolution                        |
| ------------------------------------------------- | -------------------------- | --------------------------------- |
| Database schema not yet created                   | Can't persist data         | Implement Prisma schema           |
| No authentication flow                            | Can't identify users/firms | Implement NextAuth + Google OAuth |
| API has only health endpoint                      | Limited functionality      | Scaffold document/auth routes     |
| No background job system                          | Can't process syncs        | Add BullMQ + job processors       |
| `pnpm dev` starts both apps but no logs separated | Development friction       | Consider monorepo task filtering  |

---

## Key Metrics

| Metric                             | Value                                             |
| ---------------------------------- | ------------------------------------------------- |
| **Packages**                       | 3 (api, web, shared)                              |
| **TypeScript Files**               | ~15                                               |
| **Total LOC** (excl. node_modules) | ~800                                              |
| **Build Time** (from cold)         | ~12 seconds (Turbo cached)                        |
| **Dev Time (hot reload)**          | Express ~200ms, Next.js ~500ms                    |
| **Container Images**               | 2 (api, web) + 2 infra (postgres, redis)          |
| **Port Usage**                     | API :4000, Web :3000, Postgres :5432, Redis :6379 |

---

## Dependencies Inventory

### Production

- **API:** express, cors, helmet, morgan, zod, dotenv
- **Web:** next, react, react-dom
- **Shared:** (none — pure TypeScript types)

### Dev

- **All:** typescript, turbo, pnpm
- **API:** @types/express, @types/node, tsx
- **Web:** tailwindcss, autoprefixer, postcss, @types/react

### Planned

- **API:** prisma, @prisma/client, bullmq, openai, redis, aws-sdk
- **Web:** @tanstack/react-query, zustand, react-hook-form
- **All:** eslint, prettier

---

## Next Immediate Steps (Order of Execution)

1. **Set up Prisma** — `pnpm add -D prisma @prisma/client` in api, create schema
2. **Create database schema** — Prisma schema file with all 7 tables + RLS policies
3. **Run migrations** — `prisma migrate dev --name init`
4. **Implement Google OAuth** — NextAuth.js setup + callback handler
5. **Scaffold auth routes** — POST /auth/google/callback, GET /auth/me, POST /auth/logout
6. **Add Zod validation** — Request/response schemas in shared, use in routes

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

- **Architecture Details:** See `architecture.md`
- **Product Requirements:** See `PRD.md`
- **Development Guide:** See `.github/copilot-instructions.md`
