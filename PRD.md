# MVP PRD — "AI Assistant for Accountants" (India MVP)

> **Version:** 2.0 — Updated 2026-02-25
> **Author:** @980vermarajput
> **Status:** Draft → Ready for Engineering

---

## 1 — One-line Summary

A lightweight, secure AI assistant for Indian chartered accountants that indexes Gmail, Google Drive, and client spreadsheets; answers plain-language questions grounded in those documents via RAG; and drafts professional client emails — delivered as a multi-tenant SaaS with pay-per-user onboarding.

---

## 2 — Goals & Success Metrics

### Primary Goals

| # | Goal |
|---|------|
| G1 | Validate product–market fit with small CA firms (5–20 people). |
| G2 | Measurably reduce time spent searching emails, docs, and spreadsheets. |
| G3 | Provide accurate, citation-backed answers — never hallucinated financial data. |

### Success Metrics (First 3 Months)

| Metric | Target |
|--------|--------|
| Pilot firms onboarded | ≥ 10 |
| Avg. useful queries per user / day | ≥ 5 |
| Grounded-answer accuracy (human eval) | ≥ 70 % |
| Pilot → Paid conversion | ≥ 20 % |
| P95 end-to-end chat latency | ≤ 8 s |
| User satisfaction (NPS) | ≥ 40 |

---

## 3 — Target Users & Personas

| Persona | Age | Key Pain Point | Primary MVP Use Case |
|---------|-----|----------------|----------------------|
| **Senior CA (firm owner)** | 30–50 | Context switching between 50+ clients | Quick client summary & outstanding items |
| **Associate / Junior CA** | 20–30 | Finding receipts buried in email threads | Search for specific invoices, draft follow-ups |
| **Office Admin** | 25–40 | Manual doc uploads, scheduling follow-ups | Upload client docs, view sync status |

---

## 4 — MVP Scope

### ✅ In Scope

| Feature | Description |
|---------|-------------|
| **Google OAuth** | Gmail + Drive read-only access via OAuth 2.0 with PKCE |
| **Text Extraction** | PDF (OCR fallback), DOCX, XLSX/CSV, plain text, `.eml` |
| **RAG Chat** | Ask questions → get grounded answers with source citations |
| **Draft Email** | Compose replies in professional CA tone with action items |
| **Admin Dashboard** | Sync status, user management, data freshness indicators |
| **Multi-tenancy** | Firm-level data isolation with row-level security |
| **Audit Logging** | Every query, every chunk sent to LLM, every user action |
| **Billing (simple)** | Stripe Checkout for per-seat monthly billing |

### ❌ Out of Scope (Future Phases)

- Deep accounting software integrations (Tally, Zoho Books, QuickBooks)
- Automated action execution (no auto-send emails, no writes to external systems)
- GST calculations, audit modules, or tax filing logic
- Mobile native app (responsive web only for MVP)
- Slack / WhatsApp integrations
- Custom model fine-tuning

---

## 5 — High-Level System Architecture

| Layer | Technology | Notes |
|-------|------------|-------|
| **Frontend** | Next.js 14 (App Router) | SSR + React Server Components, Tailwind CSS |
| **Backend API** | Node.js 20 + Express.js | TypeScript, modular route handlers |
| **Background Jobs** | BullMQ + Redis | Email sync, Drive sync, chunking, embedding |
| **Database** | PostgreSQL 16 + pgvector | RLS for multi-tenancy, vector similarity search |
| **Cache** | Redis 7 | Session cache, job queue, rate-limit counters |
| **Object Storage** | AWS S3 | Raw documents, processed text cache |
| **AI / LLM** | OpenAI API (GPT-4o-mini + text-embedding-3-small) | Swappable via adapter pattern |
| **Hosting** | AWS Mumbai (ap-south-1) | ECS Fargate, RDS, ElastiCache, S3 |
| **Monitoring** | CloudWatch + Sentry + Prometheus/Grafana | Logs, errors, metrics |
| **Auth** | NextAuth.js (Google provider) + JWT | Refresh token encrypted at rest |

---

## 6 — Data Model (Core Tables)

### `firms`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR(255) | Firm name |
| slug | VARCHAR(100) UNIQUE | URL-safe identifier |
| plan | ENUM('trial','starter','pro') | Billing plan |
| stripe_customer_id | VARCHAR(255) | Nullable |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `users`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| firm_id | FK → firms.id | Multi-tenancy key |
| email | VARCHAR(255) UNIQUE | |
| name | VARCHAR(255) | |
| role | ENUM('admin','member') | |
| google_refresh_token_enc | BYTEA | AES-256-GCM encrypted |
| google_token_iv | BYTEA | Initialization vector |
| last_sync_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `clients`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| firm_id | FK → firms.id | |
| created_by | FK → users.id | |
| name | VARCHAR(255) | |
| identifier | VARCHAR(100) | Client code (e.g., "ABC-001") |
| email_domain | VARCHAR(255) | Auto-detected from emails |
| metadata | JSONB | Flexible fields |
| created_at | TIMESTAMPTZ | |

### `documents`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| firm_id | FK → firms.id | RLS partition key |
| user_id | FK → users.id | Who synced it |
| client_id | FK → clients.id | Nullable |
| source | ENUM('gmail','drive','upload') | |
| source_id | VARCHAR(500) | Gmail message ID or Drive file ID |
| filename | VARCHAR(500) | |
| mime_type | VARCHAR(100) | |
| s3_key | VARCHAR(500) | Raw file in S3 |
| text_hash | VARCHAR(64) | SHA-256 for dedup |
| text_excerpt | TEXT | First 500 chars |
| status | ENUM('pending','processing','ready','error') | |
| error_message | TEXT | Nullable |
| source_date | TIMESTAMPTZ | Original email/file date |
| created_at | TIMESTAMPTZ | |

### `chunks`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| document_id | FK → documents.id | CASCADE delete |
| firm_id | FK → firms.id | RLS partition key |
| client_id | FK → clients.id | Nullable, denormalized for query speed |
| chunk_index | INT | Order within document |
| chunk_text | TEXT | |
| embedding | VECTOR(1536) | pgvector, text-embedding-3-small |
| token_count | INT | |
| metadata | JSONB | Source page, paragraph ref, etc. |
| created_at | TIMESTAMPTZ | |

**Index:** `CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`

### `queries`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| firm_id | FK → firms.id | |
| user_id | FK → users.id | |
| client_id | FK → clients.id | Nullable |
| query_text | TEXT | |
| response_text | TEXT | |
| retrieved_chunk_ids | UUID[] | Array of chunk IDs used |
| chunks_sent_to_llm | INT | Count for audit |
| llm_model | VARCHAR(50) | |
| llm_tokens_prompt | INT | |
| llm_tokens_completion | INT | |
| llm_cost_inr | DECIMAL(10,4) | Estimated cost |
| latency_ms | INT | Total E2E |
| retrieval_latency_ms | INT | Vector search only |
| feedback | ENUM('positive','negative','none') | User thumbs up/down |
| created_at | TIMESTAMPTZ | |

### `audit_logs`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| firm_id | FK → firms.id | |
| user_id | FK → users.id | |
| action | VARCHAR(100) | 'query', 'sync_gmail', 'login', etc. |
| resource_type | VARCHAR(50) | 'document', 'chunk', 'query' |
| resource_id | UUID | |
| details | JSONB | Context-specific data |
| ip_address | INET | |
| created_at | TIMESTAMPTZ | |

### `sync_jobs`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| firm_id | FK → firms.id | |
| user_id | FK → users.id | |
| type | ENUM('gmail','drive') | |
| status | ENUM('queued','running','completed','failed') | |
| documents_found | INT | |
| documents_processed | INT | |
| error_message | TEXT | Nullable |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

---

## 7 — Vectorization & Chunking Strategy

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Embedding model** | `text-embedding-3-small` (1536 dims) | Cost-effective, good quality |
| **Chunk size** | 800–1200 tokens | Balance between context and precision |
| **Chunk overlap** | 200 tokens | Preserve context across boundaries |
| **Preprocessing** | Strip boilerplate signatures, email headers, duplicate whitespace | Reduce noise |
| **Deduplication** | SHA-256 hash of normalized text | Skip re-embedding identical content |
| **Top-K retrieval** | K = 8 | Sufficient context without exceeding token limits |
| **Ranking formula** | `score = cosine_similarity × recency_weight` | |
| **Recency weight** | `1 / (1 + age_days / 365)` | Bias toward recent documents |
| **Minimum similarity threshold** | 0.72 | Filter out low-relevance noise |
| **Max context tokens** | 6,000 tokens | Cost control, fits in context window |

### Chunking Pipeline

```
Document → Text Extraction → Normalization → Dedup Check
    → Sentence-aware Splitting (800-1200 tokens, 200 overlap)
    → Batch Embedding (max 100 chunks/request)
    → Store in pgvector
```

---

## 8 — Core API Endpoints (MVP)

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/google` | Redirect to Google OAuth consent screen |
| GET | `/api/auth/google/callback` | Exchange code → store encrypted refresh token |
| POST | `/api/auth/logout` | Revoke session, clear tokens |
| GET | `/api/auth/me` | Return current user + firm info |

### Data Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sync/gmail` | Enqueue Gmail sync job (last N months) |
| POST | `/api/sync/drive` | Enqueue Drive folder sync job |
| GET | `/api/sync/status` | Per-user sync jobs with progress |
| POST | `/api/sync/cancel/:jobId` | Cancel a running sync job |

### Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/documents/upload` | Manual file upload (PDF, DOCX, XLSX) |
| GET | `/api/documents` | List documents with filters (client, source, date) |
| GET | `/api/documents/:id` | Document detail + chunk count |
| DELETE | `/api/documents/:id` | Delete document + chunks + embeddings |

### Chat / RAG

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Submit query → RAG pipeline → grounded answer |
| GET | `/api/chat/history` | Query history with pagination |
| POST | `/api/chat/:queryId/feedback` | Submit thumbs up/down feedback |

#### `POST /api/chat` — Request

```json
{
  "client_id": "c_789",
  "query": "Which invoices are still unpaid for ABC Pvt Ltd and what's the due date?",
  "filters": {
    "date_from": "2025-01-01",
    "source": ["gmail", "drive"]
  }
}
```

#### `POST /api/chat` — Response

```json
{
  "query_id": "q_456",
  "answer": "Based on the documents available, Invoice INV-2025-007 (₹45,000) is unpaid and due on 10 Mar 2026. [Excerpt: 'Invoice INV-2025-007: outstanding amount ₹45,000 due 2026-03-10']",
  "sources": [
    {
      "doc_id": "d_111",
      "filename": "client_emails_thread_2025.eml",
      "excerpt": "Invoice INV-2025-007: outstanding amount ₹45,000 due 2026-03-10",
      "link": "https://mail.google.com/mail/u/0/#inbox/18abc123",
      "source_date": "2025-12-15T10:30:00Z",
      "relevance_score": 0.94
    }
  ],
  "suggested_followups": [
    "Show me all invoices for ABC Pvt Ltd from the last 6 months",
    "Draft a payment reminder email to ABC Pvt Ltd"
  ],
  "metadata": {
    "model": "gpt-4o-mini",
    "tokens_prompt": 890,
    "tokens_completion": 230,
    "cost_estimate_inr": 2.40,
    "latency_ms": 3200,
    "retrieval_latency_ms": 180,
    "chunks_retrieved": 8,
    "chunks_used": 3
  }
}
```

### Draft Email

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/draft-email` | Generate email draft using context |
| POST | `/api/draft-email/refine` | Refine a generated draft with instructions |

#### `POST /api/draft-email` — Request

```json
{
  "client_id": "c_789",
  "thread_id": "gmail_thread_abc123",
  "tone": "professional",
  "instructions": "Remind about pending TDS certificates",
  "include_context": true
}
```

#### `POST /api/draft-email` — Response

```json
{
  "draft_text": "Dear Mr. Sharma,\n\nI hope this email finds you well...",
  "suggested_subject": "Re: Pending TDS Certificates — Action Required by 15 Mar 2026",
  "action_items": [
    "Submit Form 16A for Q3 FY2025-26",
    "Share updated TDS challan receipt"
  ],
  "suggested_deadline": "2026-03-15",
  "sources_used": ["d_111", "d_234"]
}
```

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List firm users |
| POST | `/api/admin/users/invite` | Invite user by email |
| DELETE | `/api/admin/users/:id` | Revoke user access + tokens |
| GET | `/api/admin/usage` | Query/token/cost stats |
| GET | `/api/admin/audit-log` | Audit log with filters |

---

## 9 — Prompt Design

### System Prompt (always applied)

```
SYSTEM:
You are an AI assistant for Indian chartered accountants. Your role is to help
accountants find information across their emails, documents, and client records.

RULES:
1. ONLY answer using evidence from the CONTEXT blocks provided below.
2. If the answer cannot be fully supported by the context, explicitly state:
   "I don't have enough information in the indexed documents to answer this fully."
   Then list what specific information is missing.
3. NEVER invent, hallucinate, or assume financial figures, dates, legal provisions,
   or client details.
4. For any numeric claims (amounts, dates, percentages), quote the EXACT excerpt
   in [square brackets].
5. Format action items as a numbered list with clear owners and deadlines where possible.
6. Always end with a "Sources" section listing each source document used.
7. Use professional but clear language. Avoid unnecessary jargon.
8. If asked for legal or tax advice, remind the user that your responses are
   informational only and should be verified by a qualified professional.
```

### RAG Prompt Template

```
USER QUESTION:
{user_query}

CLIENT CONTEXT (if applicable):
Client: {client_name} | Code: {client_identifier}

RETRIEVED DOCUMENTS:
---BEGIN CONTEXT---
[Chunk 1] Source: {filename_1} | Date: {source_date_1} | Relevance: {score_1}
{chunk_text_1}

[Chunk 2] Source: {filename_2} | Date: {source_date_2} | Relevance: {score_2}
{chunk_text_2}

... (up to {top_k} chunks)
---END CONTEXT---

RESPONSE INSTRUCTIONS:
1. Answer the question concisely using ONLY the context above.
2. If the context doesn't contain the answer, say so clearly and suggest
   up to 3 specific follow-up queries the user could try.
3. For any numeric or date claims, show the exact excerpt in [brackets].
4. Provide a Sources section at the end:
   - {doc_id} | {filename} | {date} | "{short_excerpt}"
```

### Email Draft Prompt Template

```
TASK:
Draft a reply email in a professional Indian Chartered Accountant tone.

CONTEXT FROM CLIENT FILES:
{relevant_chunks}

EMAIL THREAD (last 3 messages):
{last_3_messages}

ADDITIONAL INSTRUCTIONS FROM USER:
{user_instructions}

FORMATTING RULES:
- Maximum 300 words.
- Start with the client's name and a one-line context summary.
- Include 2–3 clear action items with suggested deadlines.
- Use formal but warm Indian business English.
- Close with: "— [Your Name], [Firm Name]"
- Do NOT include any information not found in the context or thread.
```

---

## 10 — UI/UX Flows (MVP)

### Flow 1: Onboarding

```
Landing Page → Sign in with Google → OAuth Consent (Gmail + Drive read)
→ Create/Join Firm → Dashboard
```

### Flow 2: Dashboard

```
┌─────────────────────────────────────────────────────┐
│  Header: Firm Name | User Avatar | Settings         │
├──────────┬──────────────────────────────────────────┤
│          │                                           │
│ Sidebar  │  Main Content Area                        │
│          │                                           │
│ • Clients│  ┌─ Sync Status Cards ─────────────────┐ │
│   - ABC  │  │ Gmail: ✅ Synced 2h ago (1,234 msgs)│ │
│   - XYZ  │  │ Drive: 🔄 Syncing... (45/120 files) │ │
│   - DEF  │  └─────────────────────────────────────┘ │
│          │                                           │
│ • All    │  ┌─ Recent Queries ────────────────────┐ │
│ • Upload │  │ "Outstanding invoices for ABC?"      │ │
│          │  │ "TDS status Q3 for XYZ Corp?"        │ │
│          │  └─────────────────────────────────────┘ │
│          │                                           │
│          │  ┌─ Chat Widget ───────────────────────┐ │
│          │  │ Ask anything about your clients...   │ │
│          │  └─────────────────────────────────────┘ │
└──────────┴──────────────────────────────────────────┘
```

### Flow 3: Chat

```
User types query → Loading skeleton with "Searching X documents..."
→ Answer card with:
  - Formatted answer (markdown)
  - Expandable source citations (click to open original)
  - Suggested follow-up questions (chips)
  - 👍/👎 feedback buttons
  - "Draft Reply" button (if email source)
```

### Flow 4: Draft Email

```
Click "Draft Reply" → Modal opens with:
  - Generated draft (editable textarea)
  - Tone selector (Professional / Friendly / Formal)
  - "Regenerate" button
  - "Copy to Clipboard" button
  - "Open in Gmail" button (pre-fills compose via mailto:)
```

---

## 11 — Security, Privacy & Compliance

| Area | Implementation |
|------|---------------|
| **Data Residency** | All infra in AWS `ap-south-1` (Mumbai) |
| **Encryption at Rest** | RDS encryption (AES-256), S3 SSE-KMS |
| **Token Encryption** | Google refresh tokens: AES-256-GCM with per-user IV, key in AWS Secrets Manager |
| **Encryption in Transit** | TLS 1.3 everywhere |
| **Multi-tenancy Isolation** | PostgreSQL Row-Level Security (RLS) on `firm_id` |
| **LLM Data Minimization** | Only send retrieved chunks to LLM, never full documents |
| **Consent UI** | Explicit opt-in: "We will read your emails and Drive files to answer queries. Your data is stored encrypted and never used to train AI models." |
| **Audit Trail** | Every query, every chunk sent to LLM, every login logged in `audit_logs` table |
| **Token Revocation** | Admin can revoke any user's Google tokens instantly |
| **Rate Limiting** | Per-user: 60 queries/hour; Per-firm: 500 queries/hour |
| **RBAC** | Admin (manage users, view audit) vs. Member (query, sync own data) |
| **Indian IT Act** | Comply with IT Act 2000, SPDI Rules 2011, DPDP Act 2023 |
| **Data Retention** | Configurable per-firm; default 12 months; auto-purge option |
| **Vulnerability Scanning** | Snyk + npm audit in CI pipeline |

---

## 12 — Non-Functional Requirements

| Requirement | Target | Measurement |
|-------------|--------|-------------|
| Chat retrieval latency (vector search) | ≤ 500 ms (P95) | Prometheus histogram |
| Full chat answer latency (E2E) | ≤ 8 s (P95) | Prometheus histogram |
| Gmail sync throughput | ≥ 100 emails/min | Job metrics |
| Document processing throughput | ≥ 50 docs/min | Job metrics |
| Availability | 99.5% during IST business hours | CloudWatch uptime |
| API error rate | < 1% | Sentry + CloudWatch |
| Max concurrent users per instance | 50 | Load testing |
| Max context tokens per query | 6,000 | Application config |
| Max file size for upload | 25 MB | Application config |
| Database backup | Automated daily with 7-day retention | RDS config |

---

## 13 — Testing & QA Strategy

### Test Pyramid

| Layer | Tools | Coverage Target |
|-------|-------|-----------------|
| **Unit Tests** | Jest | ≥ 80% for parsers, chunking, prompt builders |
| **Integration Tests** | Jest + Supertest | All API endpoints, DB operations |
| **E2E Tests** | Playwright | Critical flows: login, sync, chat, draft |
| **Load Tests** | k6 | 50 concurrent users, 8s P95 latency |
| **Security Tests** | OWASP ZAP + manual pen test | Top 10 OWASP vulnerabilities |

### Key Test Scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| T1 | PDF extraction with scanned images | OCR fallback produces readable text |
| T2 | XLSX with 50 sheets, 10K rows | All sheets parsed, chunks created within 60s |
| T3 | Query with no relevant context | "I don't have enough information..." + suggestions |
| T4 | Query about specific invoice | Exact amount + date cited with [excerpt] |
| T5 | Draft email for payment reminder | Professional tone, action items, deadline |
| T6 | User from Firm A queries Firm B data | Zero results (RLS enforced) |
| T7 | Expired Google token during sync | Auto-refresh or graceful error + re-auth prompt |
| T8 | 200 concurrent chat requests | All complete within 12s, no 5xx errors |
| T9 | Duplicate document upload | Deduped via SHA-256 hash, no duplicate chunks |
| T10 | Admin revokes user token | User's sync stops, existing data retained |

### Acceptance Test Example

> **Seed doc:** Email containing `"Invoice INV-2025-007: outstanding amount ₹45,000 due 2026-03-10"`
>
> **Query:** *"What invoices are outstanding for ABC Pvt Ltd?"*
>
> **Expected:** Answer mentions INV-2025-007 with ₹45,000 and due date in [brackets], plus Sources block referencing the document.

---

## 14 — Dev Milestones (90-Day Plan)

| Week | Sprint | Deliverables |
|------|--------|-------------|
| 0 | **Setup** | Repo structure, CI/CD pipeline, AWS infra (Terraform), DB schema migration, Google OAuth app |
| 1–2 | **Auth & Foundation** | Google OAuth flow, JWT sessions, user/firm CRUD, RLS setup, basic Next.js shell |
| 3–4 | **Ingestion Pipeline** | Gmail sync worker, Drive sync worker, S3 storage, document status tracking |
| 5–6 | **Text Processing** | PDF/DOCX/XLSX extraction, text normalization, chunking pipeline, embedding batch jobs |
| 7–8 | **RAG Engine** | Vector search with pgvector, prompt assembly, LLM integration, chat API, source citations |
| 9–10 | **Chat UI & Email Draft** | Chat interface, conversation history, draft email modal, client sidebar |
| 11 | **Admin & Polish** | Admin dashboard, audit logs, usage stats, sync status UI, error handling |
| 12 | **Pilot Launch** | Security hardening, load testing, pilot onboarding (10 firms), feedback collection |

---

## 15 — Cost & Infrastructure Estimate

### Monthly Cost (Pilot Phase: 10 firms, ~50 users)

| Item | Specification | Est. Cost (INR/month) |
|------|--------------|----------------------|
| ECS Fargate (2 tasks) | 1 vCPU, 2 GB RAM each | ₹3,000–5,000 |
| RDS PostgreSQL | db.t4g.medium, 50 GB, pgvector | ₹4,000–6,000 |
| ElastiCache Redis | cache.t4g.micro | ₹1,500–2,000 |
| S3 | ~50 GB storage | ₹100–300 |
| OpenAI API (embeddings) | ~500K tokens/day embedding | ₹1,000–3,000 |
| OpenAI API (chat) | ~200 queries/day × 2K tokens | ₹3,000–8,000 |
| CloudWatch + Sentry | Monitoring | ₹500–1,000 |
| Domain + SSL | Route53, ACM | ₹500 |
| **Total** | | **₹13,000–26,000** |

### Scaling Notes

- At 100 firms: move to larger RDS, add read replica, consider dedicated embedding service
- OpenAI costs scale linearly — implement aggressive caching of repeated queries
- Consider self-hosted embedding model (e.g., BGE) at scale to reduce costs

---

## 16 — Go-to-Market (MVP)

| Phase | Timeline | Activities |
|-------|----------|-----------|
| **Pre-launch** | Week 10–11 | LinkedIn posts in CA groups, personal outreach to 30 firms |
| **Pilot** | Week 12–16 | 10 firms, free access, weekly check-in calls |
| **Feedback** | Week 16–20 | Iterate based on pilot feedback, fix top 5 issues |
| **Paid Launch** | Week 20+ | ₹499/user/month pricing, Stripe billing |

### Demo Script (3 Use Cases, 8 minutes)

1. **"Find a missing invoice"** — Type query → see cited answer with doc link (2 min)
2. **"Summarize client communication"** — Select client → ask "What's the latest with XYZ?" (3 min)
3. **"Draft a follow-up email"** — Click Draft Reply → edit → copy to Gmail (3 min)

---

## 17 — Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| R1 | LLM hallucination of financial data | Medium | High | Strict system prompt, mandatory source citations, user feedback loop, confidence scoring |
| R2 | Google OAuth scope rejection | Low | High | Request minimal scopes, prepare compliance docs, apply for verification early |
| R3 | Data privacy concerns from firms | Medium | High | Mumbai region, encryption at rest + transit, transparent consent UI, audit logs |
| R4 | Low pilot adoption | Medium | Medium | Hands-on onboarding, video walkthroughs, dedicated Slack/WhatsApp support channel |
| R5 | OpenAI API costs exceed budget | Medium | Medium | Token caps per query, aggressive caching, summary embeddings, usage alerts |
| R6 | Poor OCR quality for scanned docs | Medium | Low | Offer manual text correction UI, flag low-confidence extractions |
| R7 | Concurrent sync overloads DB | Low | Medium | BullMQ rate limiting, connection pooling, queue prioritization |

---

## 18 — Deliverables Summary

| # | Deliverable | Owner |
|---|-------------|-------|
| D1 | Monorepo with `apps/web`, `apps/api`, `packages/shared`, `infra/` | Engineering |
| D2 | Terraform/CDK scripts for AWS Mumbai deployment | DevOps |
| D3 | Database migrations (all tables above) | Backend |
| D4 | Google OAuth integration with token encryption | Backend |
| D5 | Gmail + Drive sync workers (BullMQ) | Backend |
| D6 | Text extraction service (PDF, DOCX, XLSX) | Backend |
| D7 | Chunking + embedding pipeline | Backend |
| D8 | RAG chat endpoint with source citations | Backend |
| D9 | Email draft endpoint | Backend |
| D10 | Next.js frontend (dashboard, chat, admin) | Frontend |
| D11 | Audit logging middleware | Backend |
| D12 | Unit + integration + E2E test suites | Engineering |
| D13 | CI/CD pipeline (GitHub Actions) | DevOps |
| D14 | Load testing results (k6) | QA |
| D15 | Security assessment report | Security |