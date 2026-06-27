# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# AI Assistant for Indian Chartered Accountants

SaaS platform providing AI-powered document analysis, RAG chat, and email drafting for CA firms in India. Security-hardened MVP with per-firm cost protection and multi-tenant (firmId) isolation.

## Tech Stack

- **Backend**: Node.js 20 + Express.js + TypeScript + Prisma ORM (`@prisma/client` v6)
- **Database**: PostgreSQL 16 + pgvector (vector similarity search; embeddings are 1536-dim)
- **Frontend**: Next.js 14 (app router) + React 18 + Tailwind CSS
- **AI/ML**: OpenAI `gpt-4o-mini` (chat/tools) + `text-embedding-3-small` (embeddings)
- **Queue/Cache**: Redis 7 (ioredis) + BullMQ for background jobs
- **Auth**: Google OAuth 2.0 + JWT (HttpOnly cookies + Redis blacklist for logout)
- **Monorepo**: pnpm@9 workspace + Turborepo
- **Testing**: Vitest (test files live next to source as `*.test.ts`)

## Essential Commands

```bash
# Development (from repo root, orchestrated by Turborepo)
pnpm dev              # Start all services (API :4000, Web :3000)
pnpm build            # Build all packages (shared builds first — it's a workspace dep)
pnpm typecheck        # tsc --noEmit across the monorepo
pnpm test             # Run all tests
pnpm lint             # ESLint across packages
pnpm format           # Prettier write across repo

# Single package / single test
cd apps/api && pnpm dev          # API server only (tsx watch)
cd apps/web && pnpm dev          # Next.js frontend only
cd apps/api && pnpm test         # API tests only (vitest run)
cd apps/api && pnpm test:watch   # Watch mode
cd apps/api && pnpm vitest run src/lib/rag.test.ts   # A single test file
cd apps/api && pnpm vitest run -t "name of test"     # Filter by test name

# Database (run inside apps/api)
cd apps/api
pnpm db:migrate       # prisma migrate dev (create + apply migration)
pnpm db:seed          # Seed demo data
pnpm db:studio        # Prisma Studio
pnpm db:reset         # prisma migrate reset (DROPS data)
```

`@ai-accounting/shared` is a workspace dependency consumed by both `api` and `web`; if you change shared types/schemas, rebuild it (`pnpm build` at root, or its `dev` watcher) so consumers pick up the change.

## Environment Setup

1. Copy `.env.example` to `.env` in root (also requires Postgres + Redis running — see `docker-compose.dev.yml`).
2. Configure PostgreSQL + Redis + `OPENAI_API_KEY`.
3. Security keys: `JWT_SECRET` (64-byte), `ENCRYPTION_KEY` (32-byte, used for AES-256-GCM refresh-token encryption).
4. Cost protection: `DAILY_TOKEN_CAP_PER_FIRM`, `MAX_QUERY_TOKENS`.
5. Gmail sync limits: `MAX_EMAILS_PER_SYNC`, `DEFAULT_SYNC_MONTHS`.

## Architecture (the parts that span multiple files)

### Multi-tenancy is non-negotiable
Every tenant-scoped table carries `firmId`. Data access must filter on it: `where: { firmId: req.user!.firmId }` — this app-level filtering is the **primary** isolation mechanism, so never omit it. `requireAuth` populates `req.user` (firmId, userId, role) from the JWT and sets the per-request tenant context. Platform-admin (cross-firm) access is a separate path: `isPlatformAdmin` flag on User + `admin-auth` middleware, exposed under `/api/platform-admin` and `/api/admin`. Conventions are documented in `.claude/docs/architectural_patterns.md` — read it before adding routes.

A database-level RLS backstop also exists (`prisma/migrations/*_enforce_rls`, `src/lib/tenant-context.ts`) but is **off by default and inert** while the app connects as the `postgres` superuser. It only enforces once you switch to the restricted role and set `RLS_ENFORCE=true` — see `apps/api/prisma/rls/README.md`. Do not assume the DB will catch a missing `firmId` filter.

### Request lifecycle
`apps/api/src/index.ts` boots the HTTP server **and** starts all BullMQ workers in-process. `apps/api/src/app.ts` wires middleware + routers. The chain: `helmet`/CSP → CORS → `express.json` → `cookieParser` → `morgan` → metrics middleware → routers → 404 → `errorHandler`. Routers are mounted under `/api/*` (auth, documents, chat, sync, drafts, clients, admin, platform-admin, dashboard, deadlines, team, settings/telegram, webhooks/telegram, health).

### Standard patterns to follow
- **Errors**: throw `ApiError.badRequest("…")` (factory methods in `src/lib/api-error.ts`); the global `errorHandler` converts everything to the `ApiResponse<T>` shape. Don't hand-roll error responses.
- **Validation**: `validate(schema)` middleware (`src/middleware/validate.ts`) validates against Zod schemas in `packages/shared/src/schemas.ts`. Frontend and backend share these schemas/types — define once in `shared`.
- **Auth**: JWT from HttpOnly cookie (primary) or `Authorization` header (fallback); Redis blacklist is **fail-closed** (Redis down ⇒ request denied).

### Document → RAG pipeline (async, queue-driven)
Ingest (upload or Gmail/Drive sync) → **extraction** worker (PDF via `pdf-parse`, DOCX via `mammoth`, XLSX via `xlsx`) → **chunker** → **embedding** worker (OpenAI embeddings stored in pgvector `Chunk` rows). Chat queries (`src/lib/rag.ts`) embed the question, do pgvector similarity search scoped to `firmId`, and ground `gpt-4o-mini`. Queues are in `src/queues/`, processors in `src/workers/` (`gmail-sync`, `drive-sync`, `extraction`, `embedding`, `scheduler`).

### LLM tooling & proactive features
- `src/lib/firm-tools.ts` exposes real-time LLM tools (firm analytics, client lookup, document assignment); `firm-snapshot.ts` builds firm context.
- `chat-context.ts` + `summarizer.ts` manage conversation memory with token-budget-aware auto-cleanup (`ChatSession`/`ChatMessage` tables).
- Proactive "Command Centre": `briefing-generator.ts` (daily briefings), `alert-detector.ts` (alerts), `deadline-extractor.ts` (compliance deadlines + ICS export). These run via the `scheduler` worker/queue.
- Telegram bot integration: inbound webhooks at `/api/webhooks/telegram` (`telegram.ts`), per-user linking via `/api/settings/telegram` + `TelegramLink` table.

### Cost protection
`src/lib/token-usage.ts` enforces per-firm daily token caps and per-query limits, tracking spend in the `Query`/usage tables. Respect these when adding any LLM call path.

## Database

Schema: `apps/api/prisma/schema.prisma` (single source of truth). Core tables include `Firm`, `User`, `Client`, `Document`, `Chunk` (pgvector), `Query`, `AuditLog`, `SyncJob`, `ChatSession`/`ChatMessage`, `ExtractedDeadline`, `Alert`, `DailyBriefing`, `FirmInvite`, `TelegramLink`. Note: some migrations re-add the pgvector embedding column — generated SQL doesn't always model the `vector` type cleanly, so review embedding-related migrations by hand.

## Additional Documentation

- `.claude/docs/architectural_patterns.md` — design patterns & conventions (read before adding features)
- `.github/currentState.md` — implementation status & production-readiness
- `architecture.md` — full system architecture / C4 diagrams
- `PRD.md` — product requirements & business context
- `TESTING_GUIDE.md` — manual testing walkthrough (test fixtures: `TEST_INVOICE.pdf`, `TEST_BALANCE_SHEET.*`, generated by `create_test_documents.py`)
- `turbo.json` — Turborepo task pipeline
