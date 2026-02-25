# Architecture Document — "AI Assistant for Accountants" (India MVP)

> **Version:** 1.0 — 2026-02-25
> **Author:** @980vermarajput
> **Status:** Approved for MVP Development
> **Related:** [PRD v2.0](./PRD-AI-Assistant-for-Accountants-India-MVP.md)

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

| #   | Principle                        | Rationale                                                                                            |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| P1  | **Data isolation by default**    | Multi-tenant system handling sensitive financial data — RLS on every query                           |
| P2  | **Async-first for heavy work**   | Sync, extraction, and embedding are I/O-heavy — use job queues, not request threads                  |
| P3  | **LLM as a stateless service**   | Never store conversation state in the LLM — reconstruct context per request                          |
| P4  | **Encrypt everything sensitive** | Tokens, PII at rest (AES-256-GCM); all traffic over TLS 1.3                                          |
| P5  | **Observe everything**           | Structured logging, distributed tracing, cost tracking per query                                     |
| P6  | **Cost-aware AI usage**          | Token caps, caching, dedup — control LLM spend from day one                                          |
| P7  | **Swap-ready LLM layer**         | Abstract LLM/embedding providers behind interfaces — easy to switch to Anthropic, local models, etc. |
| P8  | **Monorepo, shared types**       | Single repo with shared TypeScript types between frontend and backend                                |

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
│  │  • Morgan Logging │  │  • /api/health    │                  │
│  │  • Helmet + CORS  │  │                   │                  │
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

### 5.1 Authentication Flow

```
User                  Next.js Frontend        API Server         Google OAuth         Database
 │                         │                     │                    │                  │
 │  Click "Sign in"        │                     │                    │                  │
 │────────────────────────▶│                     │                    │                  │
 │                         │  GET /api/auth/google                   │                  │
 │                         │────────────────────▶│                    │                  │
 │                         │                     │  Generate OAuth URL│                  │
 │                         │                     │───────────────────▶│                  │
 │  ◀──────── Redirect to Google Consent ────────┤                    │                  │
 │                         │                     │                    │                  │
 │  Approve scopes         │                     │                    │                  │
 │───────────────────────────────────────────────────────────────────▶│                  │
 │                         │                     │                    │                  │
 │  ◀──── Redirect to /callback?code=xxx ────────┤                    │                  │
 │                         │                     │                    │                  │
 │                         │  POST /callback     │                    │                  │
 │                         │────────────────────▶│                    │                  │
 │                         │                     │  Exchange code     │                  │
 │                         │                     │───────────────────▶│                  │
 │                         │                     │  ◀─ tokens ────────│                  │
 │                         │                     │                    │                  │
 │                         │                     │  Encrypt refresh token               │
 │                         │                     │  Create/Update user                  │
 │                         │                     │─────────────────────────────────────▶│
 │                         │                     │                    │                  │
 │                         │                     │  Issue JWT session │                  │
 │                         │  ◀─ Set cookie ─────│                    │                  │
 │  ◀── Redirect to dashboard                   │                    │                  │
```

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
 │            │                │  3. Vector search (top-K=8)           │              │
 │            │                │  WHERE firm_id = ? AND similarity > 0.72            │
 │            │                │  ORDER BY similarity * recency_weight DESC          │
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

Our Prisma schema defines 8 core models with pgvector support and RLS:

| Model        | Purpose                               | RLS Key | Relationships                           |
| ------------ | ------------------------------------- | ------- | --------------------------------------- |
| **Firm**     | Organization/tenant root              | firm_id | 1→many Users, Clients                   |
| **User**     | Team members (admins, staff)          | firm_id | many←one Firm; 1→many SyncJobs          |
| **Client**   | Taxpayer/business entity              | firm_id | many←one Firm; 1→many Documents         |
| **Document** | Uploaded files (Gmail, Drive, manual) | firm_id | many←one Firm, Client; 1→many Chunks    |
| **Chunk**    | Text segments with embeddings         | firm_id | many←one Document; has vector(1536)     |
| **Query**    | RAG chat queries + feedback           | firm_id | many←one User; has clientId foreign key |
| **SyncJob**  | Background sync status tracker        | firm_id | many←one User; tracks Gmail/Drive jobs  |
| **AuditLog** | Compliance + access tracking          | firm_id | logs all data modifications             |

**Key Features:**

- **Multi-tenancy via firm_id partition key** on every table
- **pgvector integration** on Chunk.embedding (1536-dim, IVFFlat index for cosine similarity)
- **Type-safe enums**: Plan, UserRole, DocumentSource, DocumentStatus, SyncType, SyncStatus, Feedback
- **Cascade deletes** for data cleanup (Document → Chunks, SyncJob orphans)
- **Timestamps** on every entity (createdAt, updatedAt)

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

_To be detailed after embedding pipeline is implemented. Currently scaffolded in POST /api/chat endpoint._

---

## 9 — Background Job Architecture

_To be detailed after BullMQ workers are implemented. Currently scaffolded in POST /api/sync/_ endpoints.\*

---

## 10 — API Architecture

### 10.1 Route Organization

All routes mounted under `/api/` prefix with standardized `ApiResponse<T>` envelope. **17 total endpoints** implemented/scaffolded:

#### **Auth Routes** (`/api/auth/*` — 4 endpoints)

- `GET /google` — Initiate Google OAuth consent flow (scaffolded)
- `GET /google/callback` — Exchange authorization code for tokens (scaffolded)
- `POST /logout` — Revoke session (implemented)
- `GET /me` — Return authenticated user + firm context (implemented, requires `requireAuth`)

#### **Documents Routes** (`/api/documents/*` — 4 endpoints)

- `GET /` — Paginated list with optional filters (source, clientId, status)
- `GET /:id` — Single document detail with chunk count
- `POST /upload` — Manual file upload (scaffolded, returns 501)
- `DELETE /:id` — Delete document + cascade delete chunks

#### **Chat Routes** (`/api/chat/*` — 3 endpoints)

- `POST /` — Submit RAG query with optional client/date filters (scaffolded, returns 501)
- `GET /history` — Query history with pagination (implemented)
- `POST /:queryId/feedback` — Record positive/negative/none feedback (implemented)

#### **Sync Routes** (`/api/sync/*` — 4 endpoints)

- `POST /gmail` — Enqueue Gmail sync job → 202 Accepted with jobId
- `POST /drive` — Enqueue Google Drive sync job → 202 Accepted with jobId
- `GET /status` — List user's recent sync jobs (20 most recent)
- `POST /cancel/:jobId` — Cancel running job (409 if already completed)

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

_Planned for Phase 2: Next.js App Router, Tailwind CSS, React Hook Form + Zod validation._

---

## 12 — Security Architecture

_Planned for Phase 2: OAuth 2.0 PKCE, JWT with refresh tokens, AES-256-GCM encryption, RLS enforcement at DB level._

---

## 13 — Infrastructure & Deployment

_Planned for Phase 2: ECS Fargate, RDS PostgreSQL, ElastiCache Redis, CloudFront CDN, GitHub Actions CI/CD._

---

## 14 — Observability & Monitoring

_Planned for Phase 2: CloudWatch logs, structured JSON logging, distributed tracing, cost tracking per query._

---

## 15 — Scalability Considerations

_Planned for Phase 2: Connection pooling, query optimization, caching strategies, worker auto-scaling._

---

## 16 — Disaster Recovery

_Planned for Phase 2: RDS automated backups, S3 versioning, job queue retention, audit log archival._

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
