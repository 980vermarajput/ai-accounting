# AI Assistant for Indian Chartered Accountants

Production-ready SaaS platform providing AI-powered document analysis, RAG chat, and email drafting for CA firms in India. Security-hardened MVP with cost protection and multi-tenant architecture.

## Tech Stack

- **Backend**: Node.js 20 + Express.js + TypeScript + Prisma ORM
- **Database**: PostgreSQL 16 + pgvector extension for vector similarity search
- **Frontend**: Next.js 14 + React 18 + Tailwind CSS
- **AI/ML**: OpenAI GPT-4o-mini + text-embedding-3-small (1536 dimensions)
- **Queue/Cache**: Redis 7 + BullMQ for background jobs
- **Auth**: Google OAuth 2.0 + JWT (HttpOnly cookies + Redis blacklist)
- **Monorepo**: pnpm workspace + Turborepo
- **Testing**: Vitest (179 tests: 135 API + 44 shared)

## Project Structure

```
├── apps/
│   ├── api/          # Express.js backend (:4000)
│   │   ├── src/
│   │   │   ├── routes/       # 6 API routers (auth, chat, documents, etc.)
│   │   │   ├── middleware/   # Auth, validation, rate limiting, error handling
│   │   │   ├── lib/          # Core services (RAG, auth, token usage, logger)
│   │   │   ├── workers/      # BullMQ background job processors
│   │   │   └── queues/       # Job queue definitions
│   │   └── prisma/           # Database schema + migrations
│   └── web/          # Next.js frontend (:3000)
│       └── src/app/          # App router pages + components
├── packages/
│   └── shared/       # Shared TypeScript types + Zod schemas
└── .claude/docs/     # Architecture documentation
```

### Key Directories

- **`apps/api/src/routes/`**: REST API endpoints with multi-tenant security (auth.ts:24, chat.ts:35, documents.ts:42)
- **`apps/api/src/lib/`**: Core business logic (rag.ts for RAG pipeline, token-usage.ts for cost protection)
- **`apps/api/src/middleware/`**: Express middleware (auth.ts for JWT+Redis, validate.ts for Zod schemas)
- **`apps/api/src/workers/`**: Background job processors for Gmail sync, document extraction, embedding generation
- **`apps/web/src/app/`**: Next.js 14 app router structure with TypeScript + Tailwind
- **`packages/shared/src/`**: Shared types (types.ts) and validation schemas (schemas.ts) used by both API and web

## Essential Commands

```bash
# Development
pnpm dev              # Start all services (API :4000, Web :3000)
pnpm build            # Build all packages
pnpm typecheck        # TypeScript validation across monorepo
pnpm test             # Run all 179 tests

# Database
cd apps/api
pnpm db:migrate       # Apply Prisma migrations
pnpm db:seed          # Seed with demo data
pnpm db:studio        # Open Prisma Studio

# Individual packages
cd apps/api && pnpm dev    # API server only
cd apps/web && pnpm dev    # Next.js frontend only
```

## Environment Setup

1. Copy `.env.example` to `.env` in root
2. Configure PostgreSQL + Redis + OpenAI API key
3. Set security keys: `JWT_SECRET` (64-byte), `ENCRYPTION_KEY` (32-byte)
4. Configure cost protection: `DAILY_TOKEN_CAP_PER_FIRM=50000`, `MAX_QUERY_TOKENS=6000`
5. Set Gmail sync limits: `MAX_EMAILS_PER_SYNC=10000`, `DEFAULT_SYNC_MONTHS=24`

## Additional Documentation

Check these files for specialized information:

- **`.claude/docs/architectural_patterns.md`**: Design patterns, conventions, and architectural decisions used throughout the codebase
- **`.github/currentState.md`**: Complete implementation status, test results, and production readiness assessment
- **`architecture.md`**: Comprehensive system architecture, C4 diagrams, and technical specifications
- **`PRD.md`**: Product requirements, feature specifications, and business context
- **`apps/api/prisma/schema.prisma`**: Complete database schema with RLS multi-tenancy (8 tables, pgvector support)
- **`turbo.json`**: Turborepo task orchestration and build pipeline configuration

## Key Features Implemented

- Multi-tenant PostgreSQL with Row-Level Security (firmId-based isolation)
- Google OAuth authentication with encrypted refresh token storage (AES-256-GCM)
- Gmail/Drive sync with BullMQ background workers and processing guardrails
- Document extraction pipeline (PDF/DOCX/XLSX) → chunking → vector embedding
- RAG chat system with pgvector similarity search and GPT-4o-mini
- AI email drafting with context grounding and Gmail API integration
- Cost protection: per-firm token caps, query limits, spend tracking
- Security hardening: JWT blacklist (fail-closed), enhanced CSP headers, structured logging
- Rate limiting, request validation, comprehensive error handling, audit logging

Production-ready for CA firm pilot programs with enterprise-grade security and cost controls.