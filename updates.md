
# AI CA Assistant — MVP → "AI Brain of the CA Firm"
# Feed this entire file to Claude Code at session start.

---

## ROLE & MISSION

You are a senior full-stack engineer working on a production SaaS codebase.
Your mission is to evolve this product from a reactive AI search tool into a
**proactive operational AI layer** for Indian Chartered Accountant firms.

The transformation in one sentence:
> **From:** User asks → system answers
> **To:** System detects → alerts user → suggests action → logs outcome

You will work through 6 sprints in order. Each sprint is a self-contained
unit of work. Complete Sprint 1 fully before starting Sprint 2.

---

## SPRINT 1 — MULTI-CLIENT AI COMMAND CENTRE
### Goal: Replace reactive search with a proactive daily briefing dashboard
### Estimated effort: 5–7 days
### Priority: CRITICAL — this is the primary product differentiator

---

### 1A. Database Migrations

Create migration `add_alerts_and_briefings`:

```sql
-- New table: alerts
model Alert {
  id          String    @id @default(cuid())
  firmId      String
  clientId    String?
  type        AlertType
  severity    Severity  @default(MEDIUM)
  title       String
  body        String
  metadata    Json      @default("{}")
  isRead      Boolean   @default(false)
  resolvedAt  DateTime?
  createdAt   DateTime  @default(now())
  expiresAt   DateTime?

  firm        Firm      @relation(fields: [firmId], references: [id])
  client      Client?   @relation(fields: [clientId], references: [id])
}

enum AlertType {
  INVOICE_OVERDUE
  CLIENT_SILENT
  DEADLINE_DETECTED
  HIGH_RISK_LANGUAGE
  SYNC_FAILURE
  TOKEN_CAP_WARNING
}

enum Severity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

-- New table: daily_briefings
model DailyBriefing {
  id          String   @id @default(cuid())
  firmId      String
  date        DateTime @db.Date
  summary     String   @db.Text
  clientCount Int      @default(0)
  alertCount  Int      @default(0)
  metadata    Json     @default("{}")
  createdAt   DateTime @default(now())

  firm        Firm     @relation(fields: [firmId], references: [id])

  @@unique([firmId, date])
}
```

Add to existing models:
- `Firm` → `alerts Alert[]`, `briefings DailyBriefing[]`
- `Client` → `alerts Alert[]`

---

### 1B. Backend — Alert Detection Service

Create `apps/api/src/lib/alert-detector.ts`:

```typescript
// This service scans existing data to generate alerts.
// It must be callable both on-demand and from BullMQ scheduler.

interface AlertDetectionResult {
  generated: number
  skipped: number  // already exists / not expired
  errors: string[]
}

// Rules to implement:
// 1. INVOICE_OVERDUE: client has document with filename matching invoice pattern
//    AND no reply document/email in last 45 days → HIGH severity
//    (Query: documents WHERE client_id = X AND created_at < NOW() - 45 days
//     AND source IN ('gmail','upload') AND filename ILIKE '%invoice%'
//     AND no related document in last 14 days)
//
// 2. CLIENT_SILENT: client has documents but last document.created_at
//    is > 30 days ago → MEDIUM; > 60 days → HIGH
//    Exclude clients with no documents at all (not yet engaged)
//
// 3. DEADLINE_DETECTED: covered in Sprint 2 — leave as TODO stub
//
// 4. HIGH_RISK_LANGUAGE: query chunks WHERE chunk_text ILIKE any of:
//    ['legal action', 'dispute', 'not received', 'reminder', 'overdue',
//     'escalate', 'complaint', 'dissatisfied', 'withdraw']
//    AND document.created_at > NOW() - 7 days → HIGH severity
//
// Deduplication rule: do not create alert if identical (firmId + clientId + type)
// exists AND isRead = false AND createdAt > NOW() - 24 hours

export async function detectAlertsForFirm(
  firmId: string
): Promise<AlertDetectionResult>

export async function detectAlertsForAllFirms(): Promise<void>
// ^ called by BullMQ scheduler, iterates all active firms
```

---

### 1C. Backend — Daily Briefing Service

Create `apps/api/src/lib/briefing-generator.ts`:

```typescript
// Generates a daily AI briefing for a firm using GPT-4o-mini.
// Input: firm's alerts + recent client activity summary
// Output: 150-200 word structured briefing stored in daily_briefings table
//
// Prompt structure:
// System: "You are a senior CA firm assistant. Generate a concise daily briefing
//   for the firm partner. Be factual and professional. Use Indian accounting context.
//   Format: 2-3 sentences of summary, then bullet points of actions needed."
// User: JSON object with {alerts, clientCount, documentsLast7Days, topClients}
//
// Cost control: max 500 tokens output, use existing token-usage service
// Cache: store result in Redis key `briefing:{firmId}:{YYYY-MM-DD}` TTL 23hr
// Idempotent: if briefing already exists for today, return cached version

export async function generateDailyBriefing(firmId: string): Promise<DailyBriefing>
```

---

### 1D. Backend — BullMQ Scheduler

Create `apps/api/src/workers/scheduler.ts`:

```typescript
// Daily cron job — runs at 7:00 AM IST (01:30 UTC)
// Uses BullMQ's built-in cron support: repeat: { cron: '30 1 * * *' }
//
// Job sequence:
// 1. detectAlertsForAllFirms()
// 2. For each firm with active users in last 7 days:
//    generateDailyBriefing(firmId)
//
// Error handling: individual firm failures must not stop other firms
// Logging: log job start/end/per-firm results to structured logger
// Queue name: 'daily-scheduler'
```

---

### 1E. Backend — New API Endpoints

Add to `apps/api/src/routes/dashboard.ts` (new router):

```
GET  /api/dashboard/briefing
     → Returns today's briefing for auth'd firm
     → If no briefing exists, generates one on-demand
     → Response: { briefing: DailyBriefing, generatedNow: boolean }

GET  /api/dashboard/alerts
     → Query params: ?severity=HIGH&unreadOnly=true&page=1&limit=20
     → Returns paginated alerts for firm, sorted by severity then createdAt
     → Response: { alerts: Alert[], total: number, unread: number }

PATCH /api/dashboard/alerts/:alertId/read
     → Marks alert as read, logs to audit_logs
     → Response: { alert: Alert }

PATCH /api/dashboard/alerts/:alertId/resolve
     → Sets resolvedAt = now(), logs to audit_logs
     → Response: { alert: Alert }

GET  /api/dashboard/command-centre
     → Single endpoint combining:
       - Today's briefing
       - Unread HIGH/CRITICAL alerts (max 10)
       - Clients needing attention (last_document > 30 days, sorted by gap)
       - Recent activity (documents added last 7 days, by client)
       - Token usage today vs cap
     → Cache: Redis key `command-centre:{firmId}` TTL 15 minutes
     → Response: CommandCentreResponse (define Zod schema in shared/)
```

Add Zod schemas to `packages/shared/src/schemas/dashboard.ts`:
- `AlertSchema`, `DailyBriefingSchema`, `CommandCentreResponseSchema`
- Include all enums: `AlertTypeSchema`, `SeveritySchema`

---

### 1F. Frontend — Command Centre Page

Create `apps/web/src/app/dashboard/page.tsx`:

**Layout:** Full-width dashboard with 4 sections

**Section 1 — Daily Briefing Card (top, full width)**
- AI-generated briefing text
- Date + "Refresh" button (calls generate-on-demand)
- Loading skeleton while generating
- "Generated X minutes ago" timestamp

**Section 2 — Alert Feed (left column, 60% width)**
- Grouped by severity: CRITICAL → HIGH → MEDIUM → LOW
- Each alert card: client name, alert type badge, body text, timestamp
- Mark as read (single click, optimistic update)
- Mark as resolved (with confirmation)
- Empty state: "✓ No alerts — your firm is all caught up"
- Pagination: load more button (not infinite scroll)

**Section 3 — Clients Needing Attention (right column, 40% width)**
- List of clients with last-contact gap > 30 days
- Each row: client name, days since last document, quick-link to chat
- Sorted by gap descending
- Max 10 shown, "See all" link

**Section 4 — Activity Summary Bar (bottom)**
- Token usage today: progress bar (used / cap)
- Documents synced last 7 days
- Queries answered last 7 days
- Active clients (had activity in last 30 days)

**UX requirements:**
- Page auto-refreshes alert count in nav badge every 5 minutes
- All data fetched server-side (React Server Component) except alert
  read/resolve actions (client component)
- Mobile-responsive: single column on < 768px
- Tailwind only, consistent with existing app design

Update `apps/web/src/components/AppNav.tsx`:
- Add "Dashboard" link at top of nav
- Show unread alert count badge (red dot if > 0)
- Fetch alert count on mount, refresh every 5 minutes

---

### 1G. Tests for Sprint 1

Write tests in `apps/api/src/__tests__/`:

```
alert-detector.test.ts
  - detectAlertsForFirm creates INVOICE_OVERDUE when conditions met
  - detectAlertsForFirm skips duplicate unread alerts within 24hr
  - detectAlertsForFirm creates CLIENT_SILENT at correct thresholds (30/60 days)
  - detectAlertsForFirm creates HIGH_RISK_LANGUAGE for matching keywords
  - detectAlertsForFirm handles firm with no clients gracefully

briefing-generator.test.ts
  - generateDailyBriefing returns cached briefing if exists
  - generateDailyBriefing calls OpenAI with correct prompt structure
  - generateDailyBriefing respects 500 token limit
  - generateDailyBriefing stores result in DB and Redis

routes/dashboard.test.ts
  - GET /api/dashboard/command-centre returns 200 with correct shape
  - GET /api/dashboard/alerts respects severity filter
  - PATCH /api/dashboard/alerts/:id/read requires auth
  - GET /api/dashboard/briefing triggers generation if none exists today
```

---

## SPRINT 2 — DEADLINE EXTRACTION
### Goal: Extract compliance deadlines from email/documents automatically
### Estimated effort: 3–4 days
### Priority: HIGH

---

### 2A. Deadline Extractor Service

Create `apps/api/src/lib/deadline-extractor.ts`:

```typescript
// Scans recently indexed chunks for date + compliance keyword patterns.
// Runs as part of the extraction worker pipeline (after chunking).
//
// Detection approach:
// 1. Regex pass: find date patterns (DD/MM/YYYY, DD-MM-YYYY, "by [date]",
//    "before [date]", "due [date]", "deadline [date]", "last date [date]")
// 2. Context window: extract 100 chars before + after each date match
// 3. Keyword filter: only flag if context contains compliance keywords:
//    ['GST', 'TDS', 'ITR', 'audit', 'ROC', 'filing', 'return', 'advance tax',
//     'due date', 'deadline', 'last date', 'penalty', 'GSTR', 'Form 16',
//     'Form 26AS', 'MCA', 'AGM', 'board meeting']
// 4. For matches: call GPT-4o-mini with structured extraction prompt:
//    - Extract: { date: ISO string, description: string, clientHint: string? }
//    - Max 5 deadlines per document
//    - Use json_object response_format
// 5. Create DEADLINE_DETECTED Alert with extractedDate in metadata
//
// Cost control: only process documents created in last 48 hours
// Skip if document already has deadline_extracted flag (add to documents table)

export async function extractDeadlinesFromDocument(
  documentId: string
): Promise<ExtractedDeadline[]>

interface ExtractedDeadline {
  date: Date
  description: string
  clientId?: string
  rawText: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}
```

### 2B. Database Migration

```sql
-- Add to documents table:
deadlineExtracted  Boolean  @default(false)
deadlineCount      Int      @default(0)

-- New table: extracted_deadlines
model ExtractedDeadline {
  id           String   @id @default(cuid())
  firmId       String
  documentId   String
  clientId     String?
  date         DateTime
  description  String
  rawText      String   @db.Text
  confidence   String   @default("MEDIUM")
  alertId      String?
  createdAt    DateTime @default(now())
}
```

### 2C. Frontend — Deadline Calendar

Create `apps/web/src/app/deadlines/page.tsx`:
- Monthly calendar view (use a lightweight calendar — no heavy dependencies)
- Each deadline shown as a dot on the date
- Click date → side panel with deadline details + source document link
- Filter by client
- Colour coding: past = red, next 7 days = orange, future = green
- List view toggle (table format, sortable by date)
- Export to ICS (ical) — allows import to Google Calendar

---

## SPRINT 3 — WHATSAPP QUERY BOT
### Goal: Allow CAs to query the system via WhatsApp
### Estimated effort: 4–5 days
### Priority: HIGH (competitive moat)

---

### 3A. WhatsApp Business API Integration

**Prerequisites (document, do not implement yet if not set up):**
- WhatsApp Business Account
- Meta Business verification
- Webhook URL registration
- Phone number ID + Access Token

Create `apps/api/src/lib/whatsapp.ts`:

```typescript
// WhatsApp Cloud API wrapper
// Base URL: https://graph.facebook.com/v18.0/{phoneNumberId}

export async function sendWhatsAppMessage(
  to: string,          // E.164 format: +919876543210
  message: string,
  firmId?: string      // for audit logging
): Promise<void>

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  components: TemplateComponent[]
): Promise<void>
```

Create `apps/api/src/routes/webhooks/whatsapp.ts`:

```
POST /api/webhooks/whatsapp
  → Webhook verification: handle GET with hub.challenge
  → Message handler:
    1. Extract sender phone, message body, timestamp
    2. Look up user by phone number in DB (add phone field to users)
    3. If user not found: send onboarding message
    4. If message starts with "/" (command): handle commands
       /help — list available commands
       /clients — list firm's clients
       /ask [client name] [question] — RAG query for specific client
       /summary [client name] — client summary
       /alerts — list unread HIGH alerts
    5. Free-text: treat as RAG query across all firm's data
       (use existing chat service, firmId from user lookup)
    6. Response: send back AI answer via sendWhatsAppMessage
    7. Audit log: log all WhatsApp queries to audit_logs with action='whatsapp_query'
  → Rate limit: 10 messages per user per hour (Redis counter)
  → Max response length: 1500 chars (WhatsApp limit)
  → Always append citation count: "📎 3 sources cited"
```

Add to `users` table: `phone String? @unique`

Add env vars to `.env.example`:
```
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
```

### 3B. WhatsApp Notification Channel

Extend alert-detector to optionally push HIGH/CRITICAL alerts via WhatsApp:
```typescript
// After creating a HIGH/CRITICAL alert:
// 1. Find firm admin users with phone numbers set
// 2. Send WhatsApp message: "⚠️ Alert: {alert.title}\n{alert.body}\nView: {deepLink}"
// 3. Log notification to audit_logs
// Config: per-firm setting whatsappAlerts: boolean (default false)
```

### 3C. Tests for Sprint 3

```
whatsapp.test.ts
  - Webhook verification returns hub.challenge
  - /ask command routes to RAG correctly
  - Unknown user gets onboarding message
  - Rate limiting blocks after 10 messages/hour
  - Response truncated at 1500 chars
```

---

## SPRINT 4 — OCR PRODUCTION UPGRADE
### Goal: Handle scanned PDFs and image-based documents reliably
### Estimated effort: 3–4 days
### Priority: HIGH (trust + accuracy)

---

### 4A. OCR Pipeline

Install: `npm install tesseract.js sharp`

Create `apps/api/src/lib/ocr.ts`:

```typescript
// Tiered extraction approach (try in order, use first success):
// Tier 1: pdf-parse (existing) — works for text-layer PDFs
// Tier 2: tesseract.js — for scanned PDFs converted to images
// Tier 3: OpenAI Vision API (gpt-4o) — for complex mixed documents

interface ExtractionResult {
  text: string
  method: 'pdf-parse' | 'tesseract' | 'openai-vision' | 'failed'
  confidence: number  // 0-1
  pageCount?: number
  warnings: string[]
}

export async function extractWithOCR(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ExtractionResult>

// Image preprocessing (via sharp before tesseract):
// - Convert to greyscale
// - Increase contrast (normalize)
// - Remove noise (median filter)
// - Resize to 300 DPI equivalent if smaller
// - Convert to PNG for tesseract

// Confidence scoring:
// - pdf-parse: confidence = 1.0 if char count > 100, else 0.3
// - tesseract: use tesseract's own confidence score
// - openai-vision: confidence = 0.85 (assumed good)
// - Below 0.4: add warning, mark document status = 'low_confidence'

// Cost control for Vision API:
// - Only use if tesseract confidence < 0.4
// - Max 2000 tokens for vision extraction
// - Log cost via token-usage service
```

Update `apps/api/src/lib/extractor.ts`:
- Replace current PDF extraction with tiered `extractWithOCR()` call
- Add `extractionMethod` and `extractionConfidence` to document metadata (store in S3 alongside text)

Update `documents` table:
```sql
extractionMethod      String?
extractionConfidence  Float?
```

### 4B. Image File Support

Extend upload endpoint to accept:
- `image/png`, `image/jpeg`, `image/webp`, `image/tiff`
- Pass directly to `extractWithOCR` with mimeType
- Store original in S3, extracted text in chunks as normal

Update multer config in upload route:
```typescript
// Add to accepted mimeTypes:
'image/png', 'image/jpeg', 'image/webp', 'image/tiff'
// Max file size for images: 10MB (OCR is slower on large images)
```

### 4C. Extraction Quality Monitoring

Add to command centre dashboard:
- "Low confidence documents" count (confidence < 0.4)
- Link to list of flagged documents
- Per-document confidence badge in `/documents` page

---

## SPRINT 5 — ADMIN DASHBOARD & OBSERVABILITY
### Goal: Operational visibility before scaling to 50+ firms
### Estimated effort: 4–5 days
### Priority: HIGH (required before Series A demo)

---

### 5A. Admin API Endpoints

Create `apps/api/src/routes/admin.ts` (requires `role === 'admin'` middleware):

```
GET /api/admin/firms
  → List all firms: id, name, plan, userCount, documentCount,
    queryCount30d, tokenUsage30d, lastActiveAt
  → Pagination, search by name

GET /api/admin/firms/:firmId/stats
  → Detailed stats for one firm:
    tokenUsage: { today, last7d, last30d, cap }
    queries: { total, last7d, avgLatencyMs, p95LatencyMs }
    documents: { total, bySource, byStatus, lowConfidence }
    syncJobs: { lastGmail, lastDrive, failureCount7d }
    alerts: { total, unread, bySeverity }

GET /api/admin/usage
  → Global usage stats:
    totalFirms, activeFirmsLast30d
    totalTokensToday, totalTokensLast30d
    estimatedCostToday (INR), estimatedCostLast30d (INR)
    queriesLast24h, p95LatencyMs
    topFirmsByTokens (top 10)

GET /api/admin/sync-failures
  → sync_jobs WHERE status = 'failed' AND createdAt > NOW() - 7d
  → Group by type (gmail/drive), sorted by createdAt desc

POST /api/admin/firms/:firmId/reset-token-cap
  → Manually reset daily token cap for a firm
  → Logs to audit_logs with action='admin_reset_token_cap'

GET /api/admin/audit-logs
  → Paginated audit log viewer
  → Filter by: firmId, userId, action, date range
  → Response includes user email, firm name (joined)
```

All admin endpoints:
- Require `role === 'admin'` AND Anthropic-internal flag (add `isAdmin` bool to users)
- Return 403 if not admin
- All accesses logged to audit_logs with action='admin_access'

### 5B. Frontend — Admin Dashboard

Create `apps/web/src/app/admin/page.tsx` (admin role guard):

**Overview Section:**
- Total firms, active firms (30d), total queries (30d)
- Global token usage today with progress bar
- Estimated cost today (INR) + last 30 days
- P95 latency chip (green < 3s, amber < 8s, red > 8s)

**Firm List Table:**
- Columns: Firm name, Plan, Users, Documents, Queries (30d), Tokens (30d), Last active, Status
- Clickable row → firm detail modal
- Search + sort

**Sync Failures Panel:**
- List of recent sync failures with firm name, type, error message, timestamp
- Retry button (calls POST /api/sync/gmail or /api/sync/drive for that firm)

**Audit Log Viewer:**
- Filterable table: firm, action, user, date range
- Useful for debugging and compliance evidence

### 5C. Metrics Collection

Create `apps/api/src/lib/metrics.ts`:

```typescript
// Lightweight metrics collection using Redis sorted sets + counters
// (Do not add Prometheus/Grafana infra — use existing Redis)

// Track on every API request (middleware):
export async function recordRequestMetrics(
  route: string,
  method: string,
  statusCode: number,
  latencyMs: number,
  firmId?: string
): Promise<void>
// Stores in Redis:
// - LPUSH metrics:latency:{route} latencyMs (keep last 1000)
// - INCR metrics:requests:{route}:{statusCode}:{YYYY-MM-DD}
// - INCR metrics:requests:firm:{firmId}:{YYYY-MM-DD}

export async function getP95Latency(route: string): Promise<number>
// Reads from metrics:latency:{route}, sorts, returns 95th percentile

export async function getDailyRequestCount(
  route: string,
  days: number
): Promise<{ date: string; count: number }[]>
```

Add metrics middleware to Express app (after auth middleware):
```typescript
app.use(metricsMiddleware)  // records latency for all /api/* routes
```

---

## SPRINT 6 — CLIENT HEALTH SCORE
### Goal: Composite AI-driven health metric per client
### Estimated effort: 3–4 days
### Priority: MEDIUM (retention + upsell driver)

---

### 6A. Health Score Algorithm

Create `apps/api/src/lib/health-score.ts`:

```typescript
// Composite score from 0-100 for each client
// Recomputed daily, stored per client

interface ClientHealthScore {
  clientId: string
  score: number        // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  components: {
    recency: number    // 0-30 points: last contact within 7d=30, 14d=20, 30d=10, >30d=0
    volume: number     // 0-25 points: document count last 30d (0=0, 1-3=10, 4-10=20, >10=25)
    engagement: number // 0-25 points: query count by firm for this client (last 30d)
    risk: number       // 0-20 points: 20 - (number of HIGH/CRITICAL alerts × 5)
  }
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING'  // vs last week's score
  lastComputedAt: DateTime
}

// Grade thresholds: A=80+, B=60-79, C=40-59, D=20-39, F=0-19
// trend: compare to score 7 days ago. >5 = IMPROVING, <-5 = DECLINING, else STABLE

export async function computeHealthScore(
  clientId: string,
  firmId: string
): Promise<ClientHealthScore>

export async function computeAllHealthScores(firmId: string): Promise<void>
// Called by daily scheduler (add to Sprint 1's scheduler.ts)
```

### 6B. Database Migration

```sql
-- Add to clients table:
healthScore         Int?
healthGrade         String?
healthTrend         String?
healthLastComputedAt DateTime?
healthComponents    Json?

-- New table: health_score_history (for trend charts)
model HealthScoreHistory {
  id        String   @id @default(cuid())
  clientId  String
  firmId    String
  score     Int
  grade     String
  date      DateTime @db.Date
  createdAt DateTime @default(now())

  @@unique([clientId, date])
}
```

### 6C. API Updates

Extend `GET /api/clients` to include `healthScore`, `healthGrade`, `healthTrend`.

Extend `GET /api/clients/:id/summary` to include:
- Current health score card with breakdown
- 30-day trend sparkline data (last 30 entries from health_score_history)

Add: `POST /api/clients/:id/health-score/refresh`
- On-demand recomputation (rate-limited: max once per 5 minutes per client)

### 6D. Frontend — Client Health Visualisation

Update `apps/web/src/app/clients/page.tsx`:
- Add health grade badge column (coloured A=green, B=blue, C=amber, D/F=red)
- Trend arrow (↑ IMPROVING, → STABLE, ↓ DECLINING)
- Sortable by health score
- Filter: "Show only unhealthy clients (C or below)"

Update client detail view / summary:
- Health score gauge (0-100 semicircle)
- Component breakdown bar chart (recency / volume / engagement / risk)
- 30-day trend line chart
- "Refresh score" button

---

## GENERAL IMPLEMENTATION NOTES

### For every sprint, follow this sequence:
1. Write/update Zod schemas in `packages/shared/`
2. Create Prisma migration
3. Write backend service/lib
4. Write API route
5. Write tests (minimum: happy path + auth check + error case)
6. Write frontend page/component
7. Run `npm test` — must stay green
8. Run `npm run typecheck` — must pass

### File naming conventions:
```
apps/api/src/
  lib/           ← Pure services (no Express req/res)
  routes/        ← Express routers
  workers/       ← BullMQ workers
  middleware/    ← Express middleware
  __tests__/     ← All tests

apps/web/src/app/
  dashboard/page.tsx
  deadlines/page.tsx
  admin/page.tsx
  clients/[id]/page.tsx  ← Update existing

packages/shared/src/
  schemas/
    dashboard.ts  ← Sprint 1
    deadlines.ts  ← Sprint 2
    health.ts     ← Sprint 6
  types/
    alerts.ts
    briefings.ts
```

### Redis key conventions (add to existing pattern):
```
briefing:{firmId}:{YYYY-MM-DD}           TTL: 23hr
command-centre:{firmId}                   TTL: 15min
alert-detect:{firmId}:{date}             TTL: 24hr (dedup)
whatsapp:ratelimit:{userId}:{YYYY-MM-DD} TTL: 24hr
metrics:latency:{route}                  LPUSH, max 1000
metrics:requests:{route}:{status}:{date} INCR, TTL: 90d
health:{clientId}:score                  TTL: 25hr
```

### Do NOT touch these without explicit instruction:
- JWT blacklist fail-closed logic
- RAG similarity threshold (0.55)
- Token encryption/decryption logic
- BullMQ job ID format
- pgvector column declaration
- Gmail/Drive sync limits
- `X-Dev-User` production block

---

## SESSION START INSTRUCTION

When you receive this file, respond with:
1. Confirmation that you've read the full context
2. Current state of the codebase (ask me to share `apps/api/src/` and
   `apps/web/src/` directory trees if you don't have them)
3. Any clarifying questions before starting Sprint 1
4. Then: begin Sprint 1A (database migration)

Work one sprint at a time. After completing each sprint, output:
- Summary of files created/modified
- Test results (paste `npm test` output)
- Any decisions made that deviate from this spec (with justification)
- Confirmation you're ready for the next sprint

Do not skip ahead. Do not start Sprint 2 until Sprint 1 tests are green.