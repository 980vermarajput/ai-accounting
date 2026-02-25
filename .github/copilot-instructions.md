# Copilot Instructions — AI Assistant for Accountants

## Architecture

This is a **pnpm + Turborepo monorepo** with three packages:

| Package                 | Path              | Runtime                                       | Purpose                                      |
| ----------------------- | ----------------- | --------------------------------------------- | -------------------------------------------- |
| `@ai-accounting/api`    | `apps/api`        | Express.js 4, Node 20, TypeScript (CommonJS)  | REST API server on port **4000**             |
| `@ai-accounting/web`    | `apps/web`        | Next.js 14 App Router, React 18, Tailwind CSS | Frontend on port **3000**                    |
| `@ai-accounting/shared` | `packages/shared` | Pure TypeScript                               | Shared types & schemas consumed by both apps |

The product is a **multi-tenant RAG SaaS** for Indian chartered accountants. Data isolation is enforced via `firm_id` and PostgreSQL RLS. The full domain model lives in `packages/shared/src/types.ts` — always import types from `@ai-accounting/shared`, never duplicate them.

## Build & Dev Commands

```bash
# Local dev (recommended): start infra then apps with hot-reload
docker compose -f docker-compose.dev.yml up -d   # Postgres (pgvector) + Redis
pnpm dev                                          # starts API :4000 + Web :3000

# Database operations
cd apps/api
pnpm db:migrate                                   # Create/apply migrations
pnpm db:seed                                      # Seed with demo data
pnpm db:studio                                    # Open Prisma Studio UI
pnpm db:reset                                     # Drop + migrate + seed (careful!)

# Full Docker stack (all services containerized)
docker compose up --build

# Build/check everything via Turborepo
pnpm build        # builds shared → api → web (dependency order)
pnpm typecheck    # type-checks all packages
```

**Critical build order:** `@ai-accounting/shared` must build first — the API references it via `tsconfig.json` project references (`"composite": true`). Turborepo handles this via `"dependsOn": ["^build"]`. Prisma client generation also runs as part of the API build step.

## Code Patterns

### API (`apps/api`)

- **Entry:** `src/index.ts` loads dotenv → imports `src/app.ts` → listens on PORT
- **Routes:** Each feature gets a dedicated router in `src/routes/` — export a typed `Router` and mount in `app.ts` under `/api/<feature>`
- **Middleware:** Place in `src/middleware/` — see `error-handler.ts` for the standard `ApiResponse` error envelope
- **Type annotations:** Always add explicit types on exported Express objects (`Router`, `Express`) to avoid TS2742 portable-type errors
- **Validation:** Use `zod` for request validation; schemas should live in `@ai-accounting/shared` when used by both apps

### Web (`apps/web`)

- Uses **Next.js App Router** — pages in `src/app/`, client components marked with `"use client"`
- `next.config.js` has `output: "standalone"` for Docker and `transpilePackages: ["@ai-accounting/shared"]`
- Styling: **Tailwind CSS** utility classes only — no CSS modules
- API base URL comes from `NEXT_PUBLIC_API_URL` env var (defaults to `http://localhost:4000`)

### Shared (`packages/shared`)

- Export all types + Zod schemas from `src/index.ts` barrel file
- **Types file** (`src/types.ts`) — domain model (Firm, User, Client, Document, Chat, Sync, API Responses)
- **Schemas file** (`src/schemas.ts`) — Zod validation schemas for all API requests/responses
- Use `── Section ──` comment separators to group related types
- All API responses wrap in `ApiResponse<T>` or `PaginatedResponse<T>` — follow this pattern for every new endpoint

## Multi-Tenancy

Every data-bearing entity **must** include `firmId: string`. Database queries will use RLS on `firm_id` — never skip this field when creating new types or DB operations.

## Environment & Docker

- **Dev infra:** `docker-compose.dev.yml` — Postgres (`pgvector/pgvector:pg16`) on 5432, Redis 7 on 6379
- **Full stack:** `docker-compose.yml` — adds API + Web containers
- **Env files:** `apps/api/.env` (copy from `.env.example`), `apps/web/.env.local`
- Database host differs: `localhost` in local dev, `postgres` inside Docker network

## Key Decisions (see also `architecture.md`)

- **LLM provider is swappable** — abstract behind adapter interfaces, don't hardcode OpenAI
- **Google OAuth tokens encrypted** with AES-256-GCM (per-user IV), key from env
- **Background jobs** will use BullMQ + Redis — heavy work (sync, embedding) must never block API request threads
- **Prisma + pgvector** for database + vector storage — no separate vector DB needed
- **Auth middleware stub** in dev mode uses `X-Dev-User` header (override with real JWT in production)
- **Multi-tenancy** via `firm_id` on every table with RLS policies enforced at DB level
