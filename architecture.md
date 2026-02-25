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

| # | Principle | Rationale |
|---|-----------|-----------|
| P1 | **Data isolation by default** | Multi-tenant system handling sensitive financial data — RLS on every query |
| P2 | **Async-first for heavy work** | Sync, extraction, and embedding are I/O-heavy — use job queues, not request threads |
| P3 | **LLM as a stateless service** | Never store conversation state in the LLM — reconstruct context per request |
| P4 | **Encrypt everything sensitive** | Tokens, PII at rest (AES-256-GCM); all traffic over TLS 1.3 |
| P5 | **Observe everything** | Structured logging, distributed tracing, cost tracking per query |
| P6 | **Cost-aware AI usage** | Token caps, caching, dedup — control LLM spend from day one |
| P7 | **Swap-ready LLM layer** | Abstract LLM/embedding providers behind interfaces — easy to switch to Anthropic, local models, etc. |
| P8 | **Monorepo, shared types** | Single repo with shared TypeScript types between frontend and backend |

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
│  │  • RLS Context    │  │  • /api/sync/*    │                  │
│  │  • Rate Limiter   │  │  • /api/chat      │                  │
│  │  • Audit Logger   │  │  • /api/draft-*   │                  │
│  │  • Error Handler  │  │  • /api/documents │                  │
│  │  • Request ID     │  │  • /api/admin/*   │                  │
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

| Component | Technology | Version | Justification |
|-----------|-----------|---------|---------------|
| Language | TypeScript | 5.x | Type safety across monorepo |
| Runtime | Node.js | 20 LTS | Stable, async-native, large ecosystem |
| Package Manager | pnpm | 8.x | Fast, disk-efficient, workspace support |
| Monorepo | Turborepo | Latest | Build caching, task orchestration |

### 6.2 Frontend

| Component | Technology | Justification |
|-----------|-----------|---------------|
| Framework | Next.js 14 (App Router) | SSR, RSC, built-in API routes, image optimization |
| Styling | Tailwind CSS 3 | Utility-first, fast iteration |
| Components | shadcn/ui | Accessible, customizable, no vendor lock-in |
| State | Zustand | Lightweight, TypeScript-friendly |
| Data Fetching | TanStack Query v5 | Cache, retry, optimistic updates |
| Forms | React Hook Form + Zod | Validation, type inference |
| Chat UI | Custom (streaming-ready) | SSE support for future streaming |

### 6.3 Backend

| Component | Technology | Justification |
|-----------|-----------|---------------|
| Framework | Express.js 4 | Mature, flexible, huge middleware ecosystem |
| Validation | Zod | Shared schemas with frontend |
| ORM | Prisma 5 | Type-safe queries, migrations, pgvector support |
| Auth | NextAuth.js + JWT | Google provider, session management |
| Job Queue | BullMQ 5 | Redis-backed, reliable, retries, rate limiting |
| File Parsing | pdf-parse, mammoth, xlsx | PDF, DOCX, XLSX extraction |
| OCR | Tesseract.js | Client-side OCR fallback for scanned PDFs |
| Embeddings | OpenAI SDK | text-embedding-3-small (1536 dims) |
| LLM | OpenAI SDK | gpt-4o-mini (swappable via adapter) |

### 6.4 Data Stores

| Store | Technology | Usage |
|-------|-----------|-------|
| Primary DB | PostgreSQL 16 + pgvector | Users, docs, chunks, queries, audit |
| Cache + Queue | Redis 7 | BullMQ jobs, session cache, rate limits |
| Object Storage | AWS S3 | Raw documents, processed text files |
| Secrets | AWS Secrets Manager | Encryption keys, API keys |

### 6.5 Infrastructure

| Component | AWS Service | Spec (MVP) |
|-----------|------------|------------|
| Compute (App) | ECS Fargate | 2 tasks, 1 vCPU / 2 GB each |
| Compute (Workers) | ECS Fargate | 2 tasks, 1 vCPU / 2 GB each |
| Database | RDS PostgreSQL | db.t4g.medium, 50 GB, Multi-AZ |
| Cache | ElastiCache Redis | cache.t4g.micro, single node |
| Storage | S3 | Standard tier, lifecycle policy |
| CDN | CloudFront | Static assets, API caching |
| DNS | Route 53 | Domain management |
| SSL | ACM | Free managed certificates |
| Firewall | WAF | OWASP rules, rate limiting |
| Monitoring | CloudWatch | Logs, metrics, alarms |
| CI/CD | GitHub Actions | Build, test, deploy |

---

## 7 — Database Architecture

### 7.1 Multi-Tenancy Strategy

```
┌─────────────────────────────────────────────────────┐
│                  PostgreSQL Instance                  │
│                                                      │
│  ┌─────────────────────────────────────────────────┐│
│  │              Row-Level Security (RLS)            ││
│  │                                                  ││
│  │  Every table with tenant data has:               