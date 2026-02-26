# Architectural Patterns & Conventions

This document outlines the key architectural patterns, design decisions, and conventions used consistently throughout the AI Accounting codebase.

## Multi-Tenancy Pattern

**Row-Level Security (RLS) by Default**
- Every database table includes `firmId` for tenant isolation
- Prisma queries automatically enforce tenant boundaries via RLS policies
- Pattern: `where: { firmId: req.user!.firmId }` in all data access
- Location: All routes in `apps/api/src/routes/*.ts`, Prisma schema `apps/api/prisma/schema.prisma:52-261`

## Error Handling Pattern

**Structured API Errors with Centralized Handling**
- Custom `ApiError` class with static factory methods for common HTTP errors
- Global error handler middleware converts all errors to consistent `ApiResponse<T>` format
- Pattern: `throw ApiError.badRequest("message")` instead of manual error objects
- Location: `apps/api/src/lib/api-error.ts`, `apps/api/src/middleware/error-handler.ts`

## Request Validation Pattern

**Zod Schema-First Validation**
- All request bodies validated against Zod schemas from `@ai-accounting/shared`
- Middleware factory pattern: `validate(schema)` returns Express middleware
- Shared types between frontend/backend derived from same schemas
- Location: `apps/api/src/middleware/validate.ts`, `packages/shared/src/schemas.ts`

## Authentication & Authorization Pattern

**Multi-Layer Auth with Graceful Fallback**
- JWT tokens from HttpOnly cookies (primary) or Authorization headers (fallback)
- Redis blacklist for logout enforcement with fail-closed security
- Global Express Request augmentation for type-safe user context
- Pattern: `app.use("/protected", requireAuth)` then access `req.user!.firmId`
- Location: `apps/api/src/middleware/auth.ts:10-96`

## Background Job Pattern

**BullMQ Queue-Based Processing**
- Separate queues for different job types (sync, extraction, embedding)
- Worker processes started alongside HTTP server in development
- Job IDs use dashes (not colons) for Redis compatibility
- Pattern: `addJobToQueue({ data, opts })` → `processJob(job)` in workers
- Location: `apps/api/src/queues/*.ts`, `apps/api/src/workers/*.ts`, `apps/api/src/index.ts:15-21`

## Database Access Pattern

**Singleton Prisma Client with Development Hot-Reload Safety**
- Global singleton prevents connection exhaustion during dev hot-reloads
- Environment-specific logging (query logs in dev, errors only in prod)
- Pattern: Import `{ prisma }` from central module, never instantiate directly
- Location: `apps/api/src/lib/prisma.ts`

## Resource Dependency Injection Pattern

**Lazy-Loaded Service Singletons**
- Redis, OpenAI, and other external services initialized on first use
- Prevents startup failures when services temporarily unavailable
- Pattern: `getRedis()`, `getOpenAI()` functions return cached instances
- Location: `apps/api/src/lib/redis.ts`, `apps/api/src/lib/embedder.ts:19`

## API Response Pattern

**Consistent Response Envelope**
- All API responses use `ApiResponse<T>` type with `success`, `data`, `error` fields
- Paginated responses extend with `pagination` metadata
- Type-safe response handling in frontend via shared types
- Location: `packages/shared/src/types.ts:192-208`, used throughout `apps/api/src/routes/*.ts`

## Cost Protection Pattern

**Token Usage Tracking with Redis**
- Per-firm daily limits checked before OpenAI API calls
- Usage recorded after successful completions for spend tracking
- Pattern: `checkTokenLimit(firmId, estimatedTokens)` → API call → `recordTokenUsage(firmId, actualUsage)`
- Location: `apps/api/src/lib/token-usage.ts`, integrated in `apps/api/src/routes/chat.ts:109-142`

## Security-First Middleware Chain Pattern

**Layered Security with Fail-Safe Defaults**
- Helmet security headers → CORS → Rate limiting → Authentication → Route handlers
- Enhanced CSP, HSTS, and COEP configurations for production safety
- Rate limiting per-user and per-firm with sliding windows
- Location: `apps/api/src/app.ts:17-49`, `apps/api/src/middleware/rate-limiter.ts`

## RAG Pipeline Pattern

**Stateless LLM with Context Reconstruction**
- No conversation state stored in LLM - context rebuilt per request
- Hard similarity thresholds for financial data accuracy (no fallbacks)
- Vector search → confidence scoring → LLM generation → response caching
- Pattern: `searchChunks()` → `computeConfidence()` → `generateRagAnswer()` → Redis cache
- Location: `apps/api/src/lib/rag.ts`, `apps/api/src/routes/chat.ts:113-131`

## Structured Logging Pattern

**Environment-Aware Observability**
- JSON structured logs in production, human-readable in development
- Specialized logging methods for business metrics (costs, performance, security)
- Consistent log context with firmId, userId, operation tracking
- Location: `apps/api/src/lib/logger.ts`, integrated throughout routes and services

## Monorepo Code Sharing Pattern

**Type-Safe Package Dependencies**
- Shared types and schemas in `packages/shared` consumed by both API and web
- Workspace dependencies via `workspace:*` for local package linking
- Barrel exports from shared package for clean import paths
- Location: `packages/shared/src/index.ts`, package.json dependencies across apps