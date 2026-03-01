# Architecture Document — "AI Assistant for Accountants" (India MVP)

> **Version:** 2.2 — Updated 2026-03-01
> **Author:** @980vermarajput
> **Status:** Production-Ready MVP — Security Hardened + Cost Protected + Smart Conversation Memory + Real-Time LLM Tools
> **Related:** [PRD v2.1](./PRD.md)

---

## Table of Contents

1. [Architecture Principles](#1--architecture-principles)
2. [System Context Diagram (C4 Level 1)](#2--system-context-diagram-c4-level-1)
3. [Container Diagram (C4 Level 2)](#3--container-diagram-c4-level-2)
4. [Component Diagram (C4 Level 3)](#4--component-diagram-c4-level-3)
5. [Data Flow Diagrams](#5--data-flow-diagrams)
6. [Technology Stack Details](#6--technology-stack-details)
7. [Database Architecture](#7--database-architecture)
8. [RAG Pipeline Architecture](#8--rag-pipeline-architecture)
9. [Background Job Architecture](#9--background-job-architecture)
10. [API Architecture](#10--api-architecture)
11. [Frontend Architecture](#11--frontend-architecture)
12. [Security Architecture](#12--security-architecture)
13. [Infrastructure & Deployment](#13--infrastructure--deployment)
14. [Observability & Monitoring](#14--observability--monitoring)
15. [Scalability Considerations](#15--scalability-considerations)
16. [Disaster Recovery](#16--disaster-recovery)
17. [ADRs (Architecture Decision Records)](#17--adrs-architecture-decision-records)

---

## 1 — Architecture Principles

| #   | Principle                         | Rationale                                                                                             |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| P1  | **Data isolation by default**     | Multi-tenant system handling sensitive financial data — RLS on every query                            |
| P2  | **Async-first for heavy work**    | Sync, extraction, and embedding are I/O-heavy — use job queues, not request threads                   |
| P3  | **LLM as a stateless service**    | Never store conversation state in the LLM — reconstruct context per request                           |
| P4  | **Encrypt everything sensitive**  | Tokens, PII at rest (AES-256-GCM); all traffic over TLS 1.3                                           |
| P5  | **Observe everything**            | Structured logging, auth events, cost tracking, RAG metrics — production observability                |
| P6  | **Cost-aware AI usage**           | ✅ Daily token caps (50K/firm), query limits (6K), Gmail sync guardrails — spend explosions prevented |
| P7  | **Swap-ready LLM layer**          | Abstract LLM/embedding providers behind interfaces — easy to switch to Anthropic, local models, etc.  |
| P8  | **Monorepo, shared types**        | Single repo with shared TypeScript types between frontend and backend                                 |
| P9  | **Smart conversation continuity** | Session-based chat with 3000-token context limit, intelligent trimming, auto-cleanup prevents bloat   |
| P10 | **Real-time firm intelligence**   | AI can query live firm data via function calling — no static snapshots, always current                |

---

## 2 — System Context Diagram (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SYSTEMS                         │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Google   │  │  Google   │  │  OpenAI  │  │    Stripe     │  │
│  │  Gmail    │  │  Drive    │  │  API     │  │  (Billing)    │  │
│  │  API      │  │  API      │  │          │  │               │  │
│  └─────┬────┘  └─────┬────┘  └────┬─────┘  └──────┬────────┘  │
│        │             │            │                │            │
└────────┼─────────────┼────────────┼────────────────┼────────────┘
         │             │            │                │
         ▼             ▼            ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│              AI ASSISTANT FOR ACCOUNTANTS (SaaS)                │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Application Core                       │  │
│  │  • Web Frontend (Next.js)                                 │  │
│  │  • API Server (Express.js)                                │  │
│  │  • Background Workers (BullMQ)                            │  │
│  │  • RAG Engine                                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└────────────────────────┬─��──────────────────────────────────────┘
                         │
                         ▼
                ┌─────────────────┐
                │   USERS          │
                │                  │
                │  • Senior CAs    │
                │  • Junior CAs    │
                │  • Office Admins │
                └─────────────────┘
```

---

## 3 — Container Diagram (C4 Level 2)

```
┌──────────────────────────────────────────────────────────────────────┐
│                         AWS Mumbai (ap-south-1)                      │
│                                                                      │
│  ┌─────────────────┐     ┌──────────────────────────────────────┐   │
│  │   CloudFront     │     │         VPC (10.0.0.0/16)            │   │
│  │   + WAF          │────▶│                                      │   │
│  │                   │     │  ┌─── Public Subnet ──────────────┐ │   │
│  └─────────────────┘     │  │                                  │ │   │
│                           │  │  ┌─────────────┐                │ │   │
│                           │  │  │ ALB          │                │ │   │
│                           │  │  │ (HTTPS:443)  │                │ │   │
│                           │  │  └──────┬──────┘                │ │   │
│                           │  └─────────┼──────────────────────┘ │   │
│                           │            │                         │   │
│                           │  ┌─── Private Subnet ──────────────┐│   │
│                           │  │         │                        ││   │
│                           │  │    ┌────▼─────┐  ┌────────────┐ ││   │
│                           │  │    │ ECS      │  │ ECS        │ ││   │
│                           │  │    │ Service: │  │ Service:   │ ││   │
│                           │  │    │ Web+API  │  │ Workers    │ ││   │
│                           │  │    │ (Fargate)│  │ (Fargate)  │ ││   │
│                           │  │    └────┬─────┘  └─────┬──────┘ ││   │
│                           │  │         │              │         ││   │
│                           │  │    ┌────▼──────────────▼──────┐ ││   │
│                           │  │    │                           │ ││   │
│                           │  │    │  ┌─────────┐ ┌─────────┐ │ ││   │
│                           │  │    │  │ RDS     │ │ Elasti- │ │ ││   │
│                           │  │    │  │ Postgres│ │ Cache   │ │ ││   │
│                           │  │    │  │ +pgvec  │ │ Redis   │ │ ││   │
│                           │  │    │  └─────────┘ └─────────┘ │ ││   │
│                           │  │    │                           │ ││   │
│                           │  │    │  ┌─────────┐             │ ││   │
│                           │  │    │  │ S3      │             │ ││   │
│                           │  │    │  │ Bucket  │             │ ││   │
│                           │  │    │  └─────────┘             │ ││   │
│                           │  │    └───────────────────────────┘ ││   │
│                           │  └─────────────────────────────────┘│   │
│                           └──────────────────────────────────────┘   │
│                                                                      │
│  ┌────────────────────────────────────────────────┐                  │
│  │  Secrets Manager  │  CloudWatch  │  KMS         │                  │
│  └────────────────────────────────────────────────┘                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4 — Component Diagram (C4 Level 3)

### 4.1 API Server Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Express.js API Server                    │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   Middleware      │  │   Route Handlers │                  │
│  │                   │  │                   │                  │
│  │  • Auth (JWT)     │  │  • /api/auth/*    │                  │
│  │  • Validate (Zod) │  │  • /api/sync/*    │                  │
│  │  • Error Handler  │  │  • /api/chat      │                  │
│  │  • RLS Context    │  │  • /api/documents │                  │
│  │  • Morgan Logging │  │  • /api/drafts    │                  │
│  │  • Helmet + CORS  │  │  • /api/health    │                  │
│  └─────────────────┘  └────────┬──────────┘                  │
│                                │                              │
│  ┌─────────────────────────────▼──────────────────────────┐  │
│  │                    Service Layer                        │  │
│  │                                                         │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │ Auth     │ │ Sync     │ │ RAG      │ │ Email    │  │  │
│  │  │ Service  │ │ Service  │ │ Service  │ │ Draft    │  │  │
│  │  │          │ │          │ │          │ │ Service  │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │  │
│  │                                                         │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │ Document │ │ Chunk    │ │ Embedding│ │ Audit    │  │  │
│  │  │ Service  │ │ Service  │ │ Service  │ │ Service  │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                │                              │
│  ┌─────────────────────────────▼──────────────────────────┐  │
│  │                  Data Access Layer                      │  │
│  │                                                         │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │ Postgres │ │ Redis    │ │ S3       │ │ External │  │  │
│  │  │ Client   │ │ Client   │ │ Client   │ │ API      │  │  │
│  │  │ (Prisma) │ │ (ioredis)│ │ (aws-sdk)│ │ Clients  │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Worker Components

```
┌──────────────────────────────────────────────────────────────┐
│                    BullMQ Worker Process                      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                    Job Processors                      │  │
│  │                                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐                   │  │
│  │  │ Gmail Sync   │  │ Drive Sync   │                   │  │
│  │  │ Processor    │  │ Processor    │                   │  │
│  │  │              │  │              │                   │  │
│  │  │ • List msgs  │  │ • List files │                   │  │
│  │  │ • Fetch body │  │ • Download   │                   │  │
│  │  │ • Extract    │  │ • Extract    │                   │  │
│  │  │ • Store S3   │  │ • Store S3   │                   │  │
│  │  └──────┬───────┘  └──────┬───────┘                   │  │
│  │         │                 │                            │  │
│  │         ▼                 ▼                            │  │
│  │  ┌──────────────────────────────┐                     │  │
│  │  │ Document Processing Pipeline │                     │  │
│  │  │                              │                     │  │
│  │  │  ┌──────────┐ ┌──────────┐  │                     │  │
│  │  │  │ Text     │ │ OCR      │  │                     │  │
│  │  │  │ Extract  │ │ Fallback │  │                     │  │
│  │  │  │ (pdf,    │ │ (Tessera-│  │                     │  │
│  │  │  │  docx,   │ │  ct)     │  │                     │  │
│  │  │  │  xlsx)   │ │          │  │                     │  │
│  │  │  └────┬─────┘ └────┬─────┘  │                     │  │
│  │  │       └──────┬─────┘        │                     │  │
│  │  │              ▼              │                     │  │
│  │  │  ┌────────────────────┐     │                     │  │
│  │  │  │ Text Normalizer    │     │                     │  │
│  │  │  │ • Strip signatures │     │                     │  │
│  │  │  │ • Remove boilerplate│    │                     │  │
│  │  │  │ • Dedup (SHA-256)  │     │                     │  │
│  │  │  └─────────┬──────────┘     │                     │  │
│  │  │            ▼                │                     │  │
│  │  │  ┌────────────────────┐     │                     │  │
│  │  │  │ Chunking Engine    │     │                     │  │
│  │  │  │ • Sentence-aware   │     │                     │  │
│  │  │  │ • 800-1200 tokens  │     │                     │  │
│  │  │  │ • 200 token overlap│     │                     │  │
│  │  │  └─────────┬──────────┘     │                     │  │
│  │  │            ▼                │                     │  │
│  │  │  ┌────────────────────┐     │                     │  │
│  │  │  │ Embedding Builder  │     │                     │  │
│  │  │  │ • Batch (100/req)  │     │                     │  │
│  │  │  │ • Store pgvector   │     │                     │  │
│  │  │  └────────────────────┘     │                     │  │
│  │  └──────────────────────────────┘                     │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 5 — Data Flow Diagrams

### 5.1 Authentication Flow (Updated)

- **JWT is stored in a HttpOnly cookie** named `__session` after Google OAuth login.
- The backend issues the JWT and sets it as a cookie (secure, sameSite strict/lax, 7-day expiry).
- On every API request, the backend checks for the JWT in the cookie first (preferred), then falls back to the `Authorization: Bearer` header (for API clients/dev tools).
- Logout clears the cookie and blacklists the JWT in Redis.
- In development, you can bypass auth using the `X-Dev-User` header.

**Summary:**

- Production: JWT is stored in a HttpOnly cookie (`__session`), checked first for all auth.
- API clients/dev tools: Can use `Authorization: Bearer <token>` header as fallback.
- Dev mode: `X-Dev-User` header bypass.

### 5.2 Data Ingestion Flow (Gmail Sync)

```
User       Frontend       API        Redis/BullMQ      Worker        Google API      S3        PostgreSQL
 │            │             │              │               │              │            │            │
 │ Click Sync │             │              │               │              │            │            │
 │───────────▶│             │              │               │              │            │            │
 │            │ POST /sync/ │              │               │              │            │            │
 │            │──────gmail──▶              │               │              │            │            │
 │            │             │  Enqueue job │               │              │            │            │
 │            │             │─────────────▶│               │              │            │            │
 │            │◀── 202 ─────│              │               │              │            │            │
 │◀─ "Sync   │             │              │               │              │            │            │
 │  started" │             │              │  Pick up job  │              │            │            │
 │            │             │              │──────────────▶│              │            │            │
 │            │             │              │               │              │            │            │
 │            │             │              │               │  List msgs   │            │            │
 │            │             │              │               │─────────────▶│            │            │
 │            │             │              │               │◀─ msg list ──│            │            │
 │            │             │              │               │              │            │            │
 │            │             │              │               │ For each message:        │            │
 │            │             │              │               │  Fetch body  │            │            │
 │            │             │              │               │─────────────▶│            │            │
 │            │             │              │               │◀─ body ──────│            │            │
 │            │             │              │               │              │            │            │
 │            │             │              │               │  Extract text│            │            │
 │            │             │              │               │──────────────────────────▶│            │
 │            │             │              │               │  (store raw) │            │            │
 │            │             │              │               │              │            │            │
 │            │             │              │               │  Dedup check │            │            │
 │            │             │              │               │─────────────────────────────────────▶│
 │            │             │              │               │              │            │            │
 │            │             │              │               │  Create doc + chunks + embeddings    │
 │            │             │              │               │─────────────────────────────────────▶│
 │            │             │              │               │              │            │            │
 │            │             │              │  Update progress             │            │            │
 │            │             │              │◀──────────────│              │            │            │
 │            │             │              │               │              │            │            │
 │ Poll status│             │              │               │              │            │            │
 │───────────▶│ GET /sync/  │              │               │              │            │            │
 │            │───status────▶              │               │              │            │            │
 │            │             │  Read job    │               │              │            │            │
 │            │             │──── status──▶│               │              │            │            │
 │◀─ progress │             │              │               │              │            │            │
```

### 5.3 RAG Chat Flow

```
User       Frontend        API Server      PostgreSQL/pgvector    Redis Cache     OpenAI API
 │            │                │                   │                   │              │
 │ Ask query  │                │                   │                   │              │
 │───────────▶│                │                   │                   │              │
 │            │ POST /api/chat │                   │                   │              │
 │            │───────────────▶│                   │                   │              │
 │            │                │                   │                   │              │
 │            │                │  1. Check cache   │                   │              │
 │            │                │──────────────────────────────────────▶│              │
 │            │                │  ◀── cache miss ──────────────────────│              │
 │            │                │                   │                   │              │
 │            │                │  2. Embed query   │                   │              │
 │            │                │────────────────────────────────────────────────────▶│
 │            │                │  ◀── query_vector ──────────────────────────────────│
 │            │                │                   │                   │              │
│            │                │  3. Vector search (top-K=20, display K=8)  │              │
│            │                │  WHERE firm_id = ? AND similarity > 0.55   │              │
│            │                │  (fallback to 0.35 if 0 results)           │              │
│            │                │  ORDER BY similarity * recency_weight DESC │              │
 │            │                │──────────────────▶│                   │              │
 │            │                │  ◀── chunks ──────│                   │              │
 │            │                │                   │                   │              │
 │            │                │  4. Build prompt (system + context + query)          │
 │            │                │                   │                   │              │
 │            │                │  5. Call LLM      │                   │              │
 │            │                │────────────────────────────────────────────────────▶│
 │            │                │  ◀── completion ────────────────────────────────────│
 │            │                │                   │                   │              │
 │            │                │  6. Parse response, extract sources   │              │
 │            │                │                   │                   │              │
 │            │                │  7. Log query + audit                 │              │
 │            │                │──────────────────▶│                   │              │
 │            │                │                   │                   │              │
 │            │                │  8. Cache result   │                  │              │
 │            │                │──────────────────────────────────────▶│              │
 │            │                │                   │                   │              │
 │            │◀── response ───│                   │                   │              │
 │◀─ answer + │                │                   │                   │              │
 │  sources   │                │                   │                   │              │
```

---

## 6 — Technology Stack Details

### 6.1 Runtime & Languages

| Component       | Technology | Version | Justification                           |
| --------------- | ---------- | ------- | --------------------------------------- |
| Language        | TypeScript | 5.x     | Type safety across monorepo             |
| Runtime         | Node.js    | 20 LTS  | Stable, async-native, large ecosystem   |
| Package Manager | pnpm       | 8.x     | Fast, disk-efficient, workspace support |
| Monorepo        | Turborepo  | Latest  | Build caching, task orchestration       |

### 6.2 Frontend

| Component     | Technology               | Justification                                     |
| ------------- | ------------------------ | ------------------------------------------------- |
| Framework     | Next.js 14 (App Router)  | SSR, RSC, built-in API routes, image optimization |
| Styling       | Tailwind CSS 3           | Utility-first, fast iteration                     |
| Components    | shadcn/ui                | Accessible, customizable, no vendor lock-in       |
| State         | Zustand                  | Lightweight, TypeScript-friendly                  |
| Data Fetching | TanStack Query v5        | Cache, retry, optimistic updates                  |
| Forms         | React Hook Form + Zod    | Validation, type inference                        |
| Chat UI       | Custom (streaming-ready) | SSE support for future streaming                  |

### 6.3 Backend

| Component    | Technology               | Justification                                                       |
| ------------ | ------------------------ | ------------------------------------------------------------------- |
| Framework    | Express.js 4             | Mature, flexible, huge middleware ecosystem                         |
| Validation   | Zod                      | Shared schemas with frontend                                        |
| ORM          | Prisma 6.19.2            | Type-safe queries, migrations, pgvector support, Node 23 compatible |
| Auth         | JWT + Google OAuth       | Custom JWT issuance, Google OAuth 2.0 PKCE flow                     |
| Job Queue    | BullMQ 5                 | Redis-backed, reliable, retries, rate limiting                      |
| File Parsing | pdf-parse, mammoth, xlsx | PDF, DOCX, XLSX extraction                                          |
| OCR          | Tesseract.js             | Client-side OCR fallback for scanned PDFs                           |
| Embeddings   | OpenAI SDK               | text-embedding-3-small (1536 dims)                                  |
| LLM          | OpenAI SDK               | gpt-4o-mini (swappable via adapter)                                 |

### 6.4 Data Stores

| Store          | Technology               | Usage                                   |
| -------------- | ------------------------ | --------------------------------------- |
| Primary DB     | PostgreSQL 16 + pgvector | Users, docs, chunks, queries, audit     |
| Cache + Queue  | Redis 7                  | BullMQ jobs, session cache, rate limits |
| Object Storage | AWS S3                   | Raw documents, processed text files     |
| Secrets        | AWS Secrets Manager      | Encryption keys, API keys               |

### 6.5 Infrastructure

| Component         | AWS Service       | Spec (MVP)                      |
| ----------------- | ----------------- | ------------------------------- |
| Compute (App)     | ECS Fargate       | 2 tasks, 1 vCPU / 2 GB each     |
| Compute (Workers) | ECS Fargate       | 2 tasks, 1 vCPU / 2 GB each     |
| Database          | RDS PostgreSQL    | db.t4g.medium, 50 GB, Multi-AZ  |
| Cache             | ElastiCache Redis | cache.t4g.micro, single node    |
| Storage           | S3                | Standard tier, lifecycle policy |
| CDN               | CloudFront        | Static assets, API caching      |
| DNS               | Route 53          | Domain management               |
| SSL               | ACM               | Free managed certificates       |
| Firewall          | WAF               | OWASP rules, rate limiting      |
| Monitoring        | CloudWatch        | Logs, metrics, alarms           |
| CI/CD             | GitHub Actions    | Build, test, deploy             |

---

## 7 — Database Architecture

### 7.1 Schema Overview

Our Prisma schema defines 10 core models with pgvector support and RLS:

| Model           | Purpose                                  | RLS Key | Relationships                                                      |
| --------------- | ---------------------------------------- | ------- | ------------------------------------------------------------------ |
| **Firm**        | Organization/tenant root                 | firm_id | 1→many Users, Clients, ChatSessions                                |
| **User**        | Team members (admins, staff)             | firm_id | many←one Firm; 1→many SyncJobs                                     |
| **Client**      | Taxpayer/business entity                 | firm_id | many←one Firm; 1→many Documents                                    |
| **Document**    | Uploaded files (Gmail, Drive, manual)    | firm_id | many←one Firm, Client; 1→many Chunks                               |
| **Chunk**       | Text segments with embeddings            | firm_id | many←one Document; has vector(1536)                                |
| **Query**       | RAG chat queries + feedback              | firm_id | many←one User; has clientId foreign key                            |
| **SyncJob**     | Background sync status tracker           | firm_id | many←one User; tracks Gmail/Drive jobs; supports keyword filtering |
| **AuditLog**    | Compliance + access tracking             | firm_id | logs all data modifications                                        |
| **ChatSession** | Conversation sessions (2hr expiry)       | firm_id | many←one Firm, User; 1→many ChatMessages; optional client context  |
| **ChatMessage** | Individual messages (user/assistant/sys) | N/A     | many←one ChatSession; tracks tokens, tools used, search results    |

**Key Features:**

- **Multi-tenancy via firm_id partition key** on every table (ChatMessages inherit from ChatSession)
- **pgvector integration** on Chunk.embedding (1536-dim, IVFFlat index for cosine similarity)
- **Type-safe enums**: Plan, UserRole, DocumentSource, DocumentStatus, SyncType, SyncStatus, Feedback, MessageRole
- **Cascade deletes** for data cleanup (Document → Chunks, ChatSession → ChatMessages)
- **Timestamps** on every entity (createdAt, updatedAt)
- **Automatic session expiry** via `expiresAt` column (2hr default, cleanup via admin endpoint)
- **Keyword-based sync filtering** via `keywords[]` and `includeAllKeywords` boolean (AND/OR logic)

### 7.2 Multi-Tenancy Strategy

```
┌─────────────────────────────────────────────────────┐
│                  PostgreSQL Instance                  │
│                                                      │
│  ┌─────────────────────────────────────────────────┐│
│  │              Row-Level Security (RLS)            ││
│  │                                                  ││
│  │  Every table with tenant data has:               ││
│  │  • firm_id column (partition key)                ││
│  │  • RLS policy: current_user_firm_id = firm_id   ││
│  │  • Unauthenticated queries blocked               ││
│  │  • Cannot SELECT across firm boundaries          ││
│  └─────────────────────────────────────────────────┘│
│                                                      │
│  Enforcement: Queries fail at DB layer, not app     │
│  (defense in depth — never trust application code)  │
└─────────────────────────────────────────────────────┘
```

---

## 8 — RAG Pipeline Architecture

### 8.1 Overview

The RAG pipeline is fully implemented in `apps/api/src/lib/rag.ts` and `apps/api/src/routes/chat.ts`. It provides grounded, citation-backed answers using pgvector similarity search over indexed document chunks.

### 8.2 Pipeline Flow (Enhanced with Conversation Memory & LLM Tools)

```
User Query (with optional sessionId)
  ↓
[1. Session Management] → createOrResumeSession() → sessionId returned
  ↓
[2. Build Conversation Context] → buildConversationContext(sessionId, 3000 token limit)
  ↓  (intelligent trimming: always keeps recent user-assistant pairs)
  ↓
[3. Cache Check] → Redis lookup (SHA256 key: firmId:query:clientId:filters, 24hr TTL)
  ↓  (cache hit → return cached response with cached:true, skip to step 12)
  ↓
[4. Embed Query] → OpenAI text-embedding-3-small (1536 dims)
  ↓
[5. Vector Search] → pgvector cosine distance, RETRIEVAL_LIMIT=20
  ↓
[6. Hard Cutoff] → SIMILARITY_THRESHOLD=0.55 (no fallback — accuracy > recall)
  ↓
[7. Recency Weighting] → score = similarity × (1 / (1 + ageDays/365))
  ↓
[8. Top-K Selection] → DEFAULT_LIMIT=8 chunks returned
  ↓
[9. Confidence Scoring] → computeConfidence(chunks) → {level, score}
  ↓
[10. Prompt Assembly] → System prompt + firm snapshot + conversation context + context blocks + user query
  ↓
[11. LLM Call (Two-Phase)] → GPT-4o-mini with function calling (3 tools available)
  ↓  Phase 1: AI decides whether to call tools (get_firm_analytics, get_client_details, find_unassigned_documents)
  ↓  Phase 2: If tools called → execute → final completion with tool results
  ↓  (response_format: json_object for structured output)
  ↓
[12. Response Parse] → Extract answer, suggestedFollowups, token counts
  ↓
[13. Save Messages] → saveMessage(sessionId, userQuery) + saveMessage(sessionId, assistantResponse)
  ↓  (tracks token usage, tools used, search results count per message)
  ↓
[14. Cache Write] → Redis SET with 24hr TTL (non-fatal on failure)
  ↓
[15. Audit & Store] → prisma.query.create (chunk IDs, tokens, cost, latency)
  ↓
ChatResponse to frontend (with confidence + cached + sessionId fields)
```

### 8.3 Key Constants

| Constant                  | Value                  | Description                                 |
| ------------------------- | ---------------------- | ------------------------------------------- |
| `SIMILARITY_THRESHOLD`    | 0.55                   | Hard cosine similarity cutoff (no fallback) |
| `DEFAULT_LIMIT`           | 8                      | Max chunks returned to prompt               |
| `RETRIEVAL_LIMIT`         | 20                     | Max rows fetched from pgvector              |
| `RECENCY_SCALE_DAYS`      | 365                    | Half-life for recency weighting             |
| `CHAT_MODEL`              | gpt-4o-mini            | LLM used for answer generation              |
| `EMBEDDING_MODEL`         | text-embedding-3-small | Embedding model (1536 dims)                 |
| `QUERY_CACHE_TTL`         | 86400 (24hr)           | Redis cache TTL for identical queries       |
| `SESSION_EXPIRY_HOURS`    | 2                      | Chat session auto-expiry (cleanup via cron) |
| `MAX_CONTEXT_TOKENS`      | 3000                   | Conversation context token limit            |
| `SESSION_ACTIVITY_UPDATE` | on every message       | Updates `lastActivity` timestamp            |

### 8.4 Hard Cutoff Strategy

For financial/accounting data, **accuracy matters more than recall**. The pipeline uses a single-pass search with a hard similarity cutoff:

1. Search with `SIMILARITY_THRESHOLD = 0.55` — no fallback pass
2. If 0 results pass the cutoff, the LLM responds with a "not enough information" guidance
3. This prevents low-confidence hallucinated answers from surfacing to accountants

### 8.5 Confidence Scoring

Every RAG response includes a `ConfidenceInfo { level, score }` computed by `computeConfidence(chunks)`:

```
score = avgSimilarity × 0.6 + coverageRatio × 0.3 + avgRecency × 0.1
```

| Component      | Weight | Calculation                                         |
| -------------- | ------ | --------------------------------------------------- |
| Avg Similarity | 0.6    | Mean cosine similarity of retrieved chunks          |
| Coverage Ratio | 0.3    | `min(chunks.length / DEFAULT_LIMIT, 1)` — diversity |
| Avg Recency    | 0.1    | Mean `1/(1 + ageDays/RECENCY_SCALE_DAYS)` per chunk |

| Level    | Score Range | UI Badge  |
| -------- | ----------- | --------- |
| `high`   | > 0.75      | 🟢 High   |
| `medium` | 0.55 – 0.75 | 🟡 Medium |
| `low`    | < 0.55      | 🔴 Low    |

### 8.6 Query Caching

Redis-based semantic query caching reduces LLM costs for repeated questions:

- **Key:** `chat:SHA256(firmId:normalizedQuery:clientId:filters)`
- **TTL:** 24 hours (86400s)
- **Cache hit:** Returns cached response with `cached: true` metadata, still persists query record for history
- **Cache write:** After LLM response, non-fatal `redis.set()` — cache failures don't break the request
- **Invalidation:** TTL-based only (24hr); document re-sync naturally expires stale cache entries

### 8.7 Cost Tracking

Every query logs estimated INR cost:

```
costInr = (promptTokens × 0.15 + completionTokens × 0.6) / 1_000_000 × 83.5
```

---

## 9 — Background Job Architecture

### 9.1 Overview

All heavy I/O work runs asynchronously via BullMQ workers backed by Redis. Four workers start on server boot in `apps/api/src/index.ts`.

### 9.2 Worker Inventory

| Worker     | Queue        | File                           | Concurrency | Purpose                                             |
| ---------- | ------------ | ------------------------------ | ----------- | --------------------------------------------------- |
| Gmail Sync | `sync`       | `workers/gmail-sync.worker.ts` | 2           | Fetch emails via Gmail API, create Document records |
| Drive Sync | `sync`       | `workers/drive-sync.worker.ts` | 2           | Fetch files via Drive API, create Document records  |
| Extraction | `extraction` | `workers/extraction.worker.ts` | 3           | Download content, extract text, chunk, store        |
| Embedding  | `embedding`  | `workers/embedding.worker.ts`  | 1           | Batch embed chunks via OpenAI, store vectors        |

### 9.3 Job Pipeline

```
[User clicks Sync] → POST /api/sync/gmail or /drive
  ↓
SyncJob created in DB + BullMQ job enqueued
  ↓
[Gmail/Drive Worker] → Fetches messages/files → Creates Document records
  ↓ (enqueues extraction job per document)
[Extraction Worker] → Downloads content → extractText() → chunkText() → chunk.createMany()
  ↓ (enqueues embedding job when document status = ready)
[Embedding Worker] → embedChunks() → UPDATE chunks SET embedding via raw SQL
```

### 9.4 Job Configuration

| Setting           | Value                 | Notes                                             |
| ----------------- | --------------------- | ------------------------------------------------- |
| Max retries       | 3                     | All queues                                        |
| Backoff           | Exponential, 15s base | Prevents API hammering                            |
| Job ID format     | `<type>-<documentId>` | **No colons** (BullMQ uses `:` in Redis keys)     |
| Dedup on re-queue | Timestamp suffix      | `extract-<id>-<Date.now()>` to avoid BullMQ dedup |

### 9.5 Critical Implementation Notes

1. **Prisma `Bytes` fields** return `Uint8Array`, not `Buffer`. All workers must use `Buffer.from(field).toString("utf8")` before decryption.
2. **BullMQ job IDs must NOT contain colons** — they conflict with the Redis key format `bull:<queue>:<jobId>`.
3. **Gmail attachment extraction**: The extraction worker recursively collects all MIME attachment parts (`collectAttachmentParts()`) and downloads each via `gmail.users.messages.attachments.get()`, combining body + attachment text.
4. **pgvector column protection**: The `embedding` column uses `Unsupported("vector(1536)")` in Prisma schema to prevent `migrate dev` from auto-dropping it.

---

## 10 — API Architecture

### 10.1 Route Organization

All routes mounted under `/api/` prefix with standardized `ApiResponse<T>` envelope. **29 total endpoints** across 8 routers:

#### **Auth Routes** (`/api/auth/*` — 4 endpoints)

- `GET /google` — Initiate Google OAuth consent flow (✅ Live)
- `GET /google/callback` — Exchange authorization code for tokens, encrypt refresh token, upsert User+Firm, issue JWT (✅ Live)
- `POST /logout` — Revoke session (✅ Live, Redis blacklist planned)
- `GET /me` — Return authenticated user + firm context (✅ Live, requires `requireAuth`)

#### **Documents Routes** (`/api/documents/*` — 5 endpoints)

- `GET /` — Paginated list with optional filters (source, clientId, status)
- `GET /:id` — Single document detail with chunk count
- `GET /thread/:threadId` — Thread summary endpoint (all emails in Gmail thread)
- `POST /upload` — Manual file upload with multer, MIME validation, extract → chunk → embed pipeline (✅ Live)
- `DELETE /:id` — Delete document + cascade delete chunks

#### **Chat Routes** (`/api/chat/*` — 3 endpoints)

- `POST /` — Submit RAG query with optional sessionId: embed query → pgvector search → LLM with function calling → grounded answer with citations (✅ Live with conversation memory + 3 AI tools)
- `GET /history` — Query history with pagination (✅ Live)
- `POST /:queryId/feedback` — Record positive/negative/none feedback (✅ Live)

#### **Drafts Routes** (`/api/drafts/*` — 3 endpoints)

- `POST /` — Generate AI email draft with optional RAG context (✅ Live)
- `POST /refine` — Refine existing draft with new instructions (✅ Live)
- `POST /send` — Save draft to Gmail via Gmail Drafts API (✅ Live)

#### **Sync Routes** (`/api/sync/*` — 4 endpoints)

- `POST /gmail` — Enqueue Gmail sync job with optional keyword filtering (AND/OR logic, max 10 keywords) → 202 Accepted with jobId (✅ Live)
- `POST /drive` — Enqueue Google Drive sync job with optional keyword filtering → 202 Accepted with jobId (✅ Live)
- `GET /status` — List user's recent sync jobs (20 most recent)
- `POST /cancel/:jobId` — Cancel running job (409 if already completed)

#### **Clients Routes** (`/api/clients/*` — 5 endpoints)

- `GET /` — List all clients for the firm (✅ Live)
- `POST /` — Create new client with name + identifier + email domain (✅ Live)
- `GET /:id` — Client detail with full metadata (✅ Live)
- `GET /:id/summary` — Client snapshot: risk scoring, document breakdown, recent activity (✅ Live)
- `POST /:id/assign-docs` — Bulk document assignment to client (✅ Live)

#### **Admin Routes** (`/api/admin/*` — 2 endpoints)

- `POST /cleanup-sessions` — Remove expired chat sessions and orphaned messages (✅ Live)
- `GET /firm-snapshot/:firmId` — Generate comprehensive firm knowledge snapshot for AI context (✅ Live)

#### **Health Route** (`/api/health` — 1 endpoint)

- `GET /` — Service status probe (returns `{ status, service, version, uptime }`)

### 10.2 Middleware Stack

**Request Flow:**

```
Incoming Request
  ↓
[Helmet] — Security headers (CSP, X-Frame-Options, etc.)
  ↓
[CORS] — Cross-origin validation
  ↓
[Morgan] — HTTP request/response logging
  ↓
[JSON Parser] — Parse application/json bodies
  ↓
[Auth Middleware] — Attach req.user (JWT or dev bypass)
  ↓
[Zod Validate] — Schema validation (per-route)
  ↓
[Route Handler] — Business logic
  ↓
[Error Handler] — Catch all errors → formatted ApiResponse
```

**Key Middleware Files:**

- **auth.ts**: JWT verification stub + dev bypass (`X-Dev-User` header). Validates `req.user!.firmId` for RLS enforcement. `requireAuth` and `requireAdmin` middleware exported.
- **validate.ts**: Zod schema middleware factory. Validates req.body against schema, returns 400 on validation failure.
- **error-handler.ts**: Global Express error handler. Catches ApiError + generic Error, formats as `{ success: false, error: { code, message } }`

### 10.3 Request/Response Pattern

**All responses follow ApiResponse<T> envelope:**

```typescript
Success Response:
{ success: true, data: T }

Error Response:
{ success: false, error: { code: string, message: string } }

Paginated Response:
{ success: true, data: T[], pagination: { page, pageSize, total } }
```

**Validation Pattern (Example - Chat Request):**

```typescript
chatRouter.post(
  "/",
  validate(chatRequestSchema), // ← Zod middleware validates body
  requireAuth, // ← Auth middleware attaches user
  async (req, res, next) => {
    try {
      const body = req.body as ChatRequest;
      const { firmId } = req.user!; // ← RLS enforcement
      // ... query Prisma with firmId filter
      res.json({ success: true, data: result });
    } catch (err) {
      next(err); // ← Forward to error handler
    }
  },
);
```

**Status Code Conventions:**

- `200` — Successful GET, DELETE, PATCH
- `201` — Successful resource creation (POST)
- `202` — Accepted for async operations (sync jobs)
- `400` — Validation error (bad request)
- `401` — Missing/invalid authentication
- `403` — Insufficient permissions
- `404` — Resource not found
- `409` — Conflict (e.g., trying to cancel completed job)
- `500` — Server error (logged, forwarded to error handler)
- `501` — Not implemented (scaffolded endpoints)

---

## 11 — Frontend Architecture

### 11.1 Overview

The frontend is a **Next.js 14 App Router** application with **Tailwind CSS** utility classes. It lives in `apps/web/` and runs on port 3000.

### 11.2 Route Structure

```
src/app/
  layout.tsx              ← Root layout, wraps UserProvider
  page.tsx                ← Root redirect: /chat or /sign-in
  globals.css             ← Tailwind base + custom styles
  sign-in/page.tsx        ← Google OAuth sign-in card
  auth/
    callback/page.tsx     ← OAuth callback, stores JWT
    error/page.tsx        ← Auth error display
  (app)/
    layout.tsx            ← Protected layout, auth guard, AppNav sidebar
    chat/page.tsx         ← RAG chat interface
    documents/page.tsx    ← Documents dashboard
    sync/page.tsx         ← Sync control centre
    drafts/page.tsx       ← AI email drafting
```

### 11.3 Key Components

| Component      | File                           | Purpose                                                                                          |
| -------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `AppNav`       | `components/app-nav.tsx`       | Fixed 224px sidebar: firm name, nav links (Chat/Docs/Sync/Drafts/Clients), user avatar, sign-out |
| `UserProvider` | `contexts/user-context.tsx`    | Auth context: fetches `/api/auth/me`, provides `useUser()` hook                                  |
| `apiFetch`     | `lib/api.ts`                   | Typed fetch wrapper with `credentials: 'include'` for HttpOnly cookie auth                       |
| `ThreadViewer` | `components/thread-viewer.tsx` | Gmail conversation thread viewer with collapsible message cards                                  |

### 11.4 Page Features

- **Chat**: History sidebar (30 recent queries), message thread with user/assistant/error bubbles, expandable source citations, follow-up chips, auto-resizing textarea, starter suggestions, thinking indicator, **session state management** (automatic session ID tracking for conversation continuity across page reloads)
- **Documents**: Sync Gmail/Drive buttons, active-sync banner with polling, filterable table (source + status), status badges, pagination, **client filter dropdown**, **re-sync button** for updating document-client assignments
- **Sync**: Gmail + Drive action cards with **keyword filtering UI** (AND/OR logic selector, chip-based keyword input), ref-based `setTimeout` polling (not `setInterval`), animated running indicator, duration column, per-job Cancel
- **Clients** (NEW): Client listing with creation modal, client detail view with comprehensive analytics (risk scoring, document breakdown, recent activity), Gmail thread viewer integration, bulk document assignment
- **Drafts**: Instruction textarea, client-ID filter, context toggle, editable subject + body, Refine panel, Context Sources accordion, Copy-to-clipboard, cost/latency metadata, **Save to Gmail** button

### 11.5 Configuration

- `output: "standalone"` for Docker builds
- `transpilePackages: ["@ai-accounting/shared"]` for shared types
- API base from `NEXT_PUBLIC_API_URL` env var (defaults to `http://localhost:4000`)
- JWT stored in `localStorage` (planned migration to `HttpOnly` cookie)

---

## 12 — Security Architecture

### 12.1 Authentication Flow

```
[Google OAuth 2.0] → Authorization Code → Exchange for tokens
  ↓
Refresh token encrypted with AES-256-GCM (per-user random 12-byte IV)
  ↓
Stored as BYTEA in PostgreSQL (google_refresh_token_enc + google_token_iv)
  ↓
JWT session token issued (15m expiry, HS256, issuer + audience validated)
  ↓
Stored in localStorage (production: planned migration to HttpOnly cookie)
```

### 12.2 Encryption Details

| Component        | Algorithm   | Key Source                          |
| ---------------- | ----------- | ----------------------------------- |
| Refresh tokens   | AES-256-GCM | `ENCRYPTION_KEY` env var (32 bytes) |
| JWT signing      | HS256       | `JWT_SECRET` env var (64 bytes)     |
| Password hashing | N/A         | Google OAuth only, no passwords     |

### 12.3 Auth Middleware

- **`requireAuth`**: Verifies JWT from `Authorization: Bearer <token>` header. In dev mode, accepts `X-Dev-User` header as JSON bypass.
- **`requireAdmin`**: Extends `requireAuth`, checks `req.user.role === 'admin'`.
- **RLS enforcement**: Every authenticated request includes `req.user.firmId` for tenant isolation.

### 12.4 Multi-Tenancy Security

- PostgreSQL RLS policies on every table with `firm_id`
- Application-level `firmId` filter on all Prisma queries
- Workers decrypt tokens per-user: `Buffer.from(user.googleRefreshTokenEnc).toString("utf8")` then `decrypt()`

### 12.5 Security Status (Updated 1 Mar 2026)

| Item              | Status                                                | Notes                                                   |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| JWT storage       | ✅ HttpOnly cookie (`__session`) with Bearer fallback | Cookie checked first, header fallback for API clients   |
| Logout            | ✅ Redis JWT blacklist (fail-closed)                  | Blacklist check fails CLOSED (503) on Redis downtime    |
| Rate limiting     | ✅ Redis sliding-window enforced                      | Per-user 60/hr, per-firm 500/hr, per-IP 30/min (public) |
| X-Dev-User bypass | ✅ Production-hardened                                | Explicit 403 rejection when sent in production          |
| Cost protection   | ✅ Token caps + sync guardrails                       | 50K tokens/day/firm, 6K/query, 10K emails/sync          |
| Session cleanup   | ✅ Auto-expiry with admin endpoint                    | 2hr TTL, cleanup via `POST /admin/cleanup-sessions`     |

---

## 13 — Infrastructure & Deployment

### 13.1 Local Development

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres (pgvector) + Redis
pnpm dev                                          # starts API :4000 + Web :3000
```

| Service    | Container        | Port | Image                  |
| ---------- | ---------------- | ---- | ---------------------- |
| PostgreSQL | postgres         | 5432 | pgvector/pgvector:pg16 |
| Redis      | redis            | 6379 | redis:7-alpine         |
| API        | host (tsx watch) | 4000 | —                      |
| Web        | host (next dev)  | 3000 | —                      |

### 13.2 Docker Compose (Full Stack)

`docker-compose.yml` adds containerized API + Web services alongside Postgres + Redis. Both apps have multi-stage `Dockerfile`s.

### 13.3 Production (Planned)

AWS Mumbai (ap-south-1): ECS Fargate, RDS PostgreSQL, ElastiCache Redis, CloudFront CDN, GitHub Actions CI/CD.

---

## 14 — Observability & Monitoring

### 14.1 Current State

- **Morgan** HTTP request logging (dev format)
- **Structured console logging** in all workers with `[Worker Name]` prefixes
- **Per-query cost tracking** in `queries` table (tokens, latency, INR cost)
- **Audit log** table for all user actions
- **BullMQ dashboard** available via Bull Board (not yet wired)

### 14.2 Production (Planned)

CloudWatch logs, structured JSON logging, distributed tracing, Sentry error tracking, Prometheus metrics, Grafana dashboards.

---

## 15 — Scalability Considerations

### 15.1 Current Limits

- **pgvector IVFFlat index** with `lists=100` — good for <1M vectors; switch to HNSW at scale
- **Embedding worker concurrency=1** to respect OpenAI RPM limits
- **BullMQ sync concurrency=2** per worker type
- **Single Prisma client instance** with connection pooling

### 15.2 Scaling Strategy (Future)

- Connection pooling via PgBouncer
- Worker auto-scaling on ECS Fargate
- Query result caching in Redis
- Self-hosted embedding model (BGE) to reduce OpenAI costs at >100 firms

---

## 16 — Disaster Recovery

### 16.1 Current State

- **Database**: Docker volume for local dev; production will use RDS automated daily backups with 7-day retention
- **Job queue**: BullMQ jobs persisted in Redis; failed jobs retained for inspection and retry
- **Documents**: Re-syncable from Gmail/Drive at any time (source of truth is Google)

### 16.2 Production (Planned)

RDS Multi-AZ, S3 versioning, Redis persistence (AOF), audit log archival to S3 Glacier.

---

## 17 — ADRs (Architecture Decision Records)

### ADR-001: Monorepo with Shared Types

**Decision:** Single pnpm workspace with @ai-accounting/api, @ai-accounting/web, @ai-accounting/shared

**Rationale:**

- Single source of truth for TypeScript types across frontend + backend
- Shared Zod schemas prevent validation divergence
- Turborepo build orchestration handles dependency order automatically

**Consequences:**

- Shared package must build before API/Web (enforced by `"dependsOn": ["^build"]`)
- Type errors in shared block entire monorepo builds
- Developers need pnpm + Node 20+ for local development

---

### ADR-002: RLS-First Multi-Tenancy

**Decision:** PostgreSQL Row-Level Security (RLS) on every table, firm_id partition key on all queries

**Rationale:**

- Prevents accidental cross-tenant data leaks
- Enforced at database layer (defense in depth)
- Audit trail of all failed cross-tenant access attempts

**Consequences:**

- Every Prisma query must include firmId filter (code discipline required)
- RLS policy misconfiguration can silently break queries
- Requires comprehensive RLS test suite

---

### ADR-003: Async-First with BullMQ

**Decision:** Background sync (Gmail/Drive), text extraction, embedding all run async via BullMQ workers

**Rationale:**

- Keep API response times under 200ms
- Prevent timeout on large document processing
- Scale workers independently from API servers

**Consequences:**

- Must handle job failures gracefully (retries, dead-letter queue)
- Frontend must poll sync status endpoint (no real-time push)
- Infrastructure cost of running extra worker containers

---

### ADR-004: Pgvector for Embeddings (Not Separate Vector DB)

**Decision:** Store 1536-dim embeddings directly in PostgreSQL with pgvector extension

**Rationale:**

- Single database reduces operational complexity
- IVFFlat index provides good performance for <10M vectors
- RLS enforcement works naturally on chunks table

**Consequences:**

- Not suitable for >100M embeddings (would need Weaviate/Pinecone)
- Similarity search latency grows with dataset size
- Must maintain vector index health (periodic REINDEX)

---

### ADR-005: Stateless LLM Queries

**Decision:** Reconstruct full context (top-K chunks + query) per request, never cache in session

**Rationale:**

- Simplifies deployment (no centralized session store)
- Allows load balancing across stateless API workers
- Each query uses latest embeddings + documents

**Consequences:**

- Higher latency per query (must run vector search every time)
- Frontend cannot maintain multi-turn conversation state
- Need prompt caching or semantic dedup to reduce LLM token cost

---

### ADR-006: Dev Auth Bypass via X-Dev-User Header

**Decision:** In development, `X-Dev-User` header bypasses JWT verification; production uses real JWT

**Rationale:**

- Speeds up local dev (no OAuth flow setup needed)
- Same auth middleware works locally + prod (easy to test)
- Dev user in header includes firmId for RLS testing

**Consequences:**

- Must disable bypass in production build
- Critical security risk if X-Dev-User accepted in prod
- Developers must test full OAuth flow before deploying
