# Future Improvements

> **Last Updated:** 26 February 2026  
> **Status:** Planning Document — Post-MVP Features

This document tracks planned improvements and features that are not part of the current MVP but should be implemented for production readiness or enhanced user experience.

---

## 1 — Multi-User Firm Onboarding

### Current Limitation

**Every user who signs in via Google OAuth gets their own isolated firm.**

When a first-time user authenticates:

1. A new `Firm` record is auto-created with `name` = user's display name
2. A new `User` record is created with `role: "admin"` linked to that firm
3. Result: No team collaboration — each CA operates in a single-person firm

**Issues:**

- ❌ Can't invite colleagues to join the same firm
- ❌ No shared access to clients, documents, or queries
- ❌ Name collisions (multiple "Abhishek Verma & Associates" firms)
- ❌ Breaks the multi-tenant model for teams (5–20 people per firm)

### Recommended Solution

**Implement an onboarding flow after first OAuth:**

```
New User Signs In (first time)
  ↓
[Onboarding Page]
  ├─ Option A: "Create a new firm"
  │    ├─ Collect firm name, GST number, address
  │    ├─ Create Firm + User (admin)
  │    └─ Redirect to dashboard
  │
  └─ Option B: "Join an existing firm"
       ├─ Enter invite code/token
       ├─ Validate invite token (check expiry, firm exists)
       ├─ Create User (role from invite, e.g., "member")
       └─ Redirect to dashboard
```

### Database Changes

**New `invites` table:**

```prisma
model Invite {
  id        String   @id @default(uuid())
  firmId    String
  firm      Firm     @relation(fields: [firmId], references: [id], onDelete: Cascade)
  email     String   // invited user's email
  role      UserRole @default(MEMBER) // admin or member
  token     String   @unique // random 32-char token
  expiresAt DateTime
  createdBy String   // admin who sent invite
  createdAt DateTime @default(now())
}
```

### API Changes

**New endpoints:**

| Method | Endpoint              | Description                          | Auth           |
| ------ | --------------------- | ------------------------------------ | -------------- |
| POST   | `/api/invites`        | Admin sends invite by email          | `requireAdmin` |
| GET    | `/api/invites`        | List pending invites for firm        | `requireAdmin` |
| DELETE | `/api/invites/:id`    | Revoke invite                        | `requireAdmin` |
| POST   | `/api/invites/accept` | Accept invite via token, create User | Public         |

**Update existing:**

- `GET /api/auth/google/callback` — after OAuth, check if user exists:
  - **Exists:** Log in normally
  - **New + has `?invite=<token>` param:** Validate token → create User with `firmId` from invite
  - **New + no invite:** Redirect to `/onboarding` instead of `/chat`

### Frontend Changes

**New pages:**

- `/onboarding` — "Create firm" vs "Join firm" choice
- `/settings/team` — Admin page to invite users, view team, revoke access

**Updated:**

- `auth/callback` — handle `?invite=<token>` param
- `AppNav` — add "Team" link for admins

### Security Notes

- Invite tokens must be cryptographically random (32 bytes, hex-encoded)
- Expiry: 7 days from creation
- One-time use: delete invite after acceptance
- Email validation: only allow invited email to accept

---

## 2 — Production Auth Hardening

### Current Issues

| Issue                        | Impact                                | Status    |
| ---------------------------- | ------------------------------------- | --------- |
| JWT stored in `localStorage` | Vulnerable to XSS attacks             | 🟡 Dev OK |
| No logout blacklist          | Old JWTs valid until expiry (15 min)  | 🟡 Dev OK |
| `X-Dev-User` bypass active   | Security risk if not disabled in prod | 🟡 Dev OK |

### Recommended Changes

1. **Move JWT to `HttpOnly` cookies:**
   - Backend: `res.cookie('auth_token', jwt, { httpOnly: true, secure: true, sameSite: 'strict' })`
   - Frontend: Remove `localStorage.getItem('token')` — cookies sent automatically
   - CSRF protection via `sameSite: 'strict'`

2. **Redis JWT blacklist for logout:**
   - On logout: `redis.setex(jti, ttl, '1')` (jti = JWT ID claim)
   - Auth middleware: check `redis.get(jti)` before verifying
   - Auto-expire blacklist entries after JWT expiry

3. **Disable dev bypass in production:**
   - Wrap `X-Dev-User` logic in `if (process.env.NODE_ENV !== 'production')`
   - Add warning log if header detected in prod

---

## 3 — Gmail Send Integration (Drafts → Gmail)

### Current Limitation

Drafts page generates email text but has no "Save to Gmail" or "Send" functionality. User must copy-paste into Gmail manually.

### Recommended Solution

**Add Gmail Drafts API integration:**

```typescript
// POST /api/drafts/:id/send
async function saveDraftToGmail(draftId: string, userId: string) {
  const draft = await prisma.draft.findUnique({ where: { id: draftId } });
  const user = await prisma.user.findUnique({ where: { id: userId } });

  // Decrypt refresh token
  const refreshToken = decrypt(
    Buffer.from(user.googleRefreshTokenEnc).toString("utf8"),
  );

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  // Create draft in Gmail
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const message = createMimeMessage(
    draft.subject,
    draft.body,
    draft.recipientEmail,
  );

  const result = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw: Buffer.from(message).toString("base64url") },
    },
  });

  return result.data; // { id, message: { id, threadId } }
}
```

**Frontend changes:**

- Add "Save to Gmail" button on Drafts page
- After save: show "Draft saved! [Open in Gmail]" link
- Link format: `https://mail.google.com/mail/u/0/#drafts?compose=${draftId}`

**Scopes required:**

- Already have: `https://www.googleapis.com/auth/gmail.readonly`
- **Need to add:** `https://www.googleapis.com/auth/gmail.compose` (for drafts)

---

## 4 — OCR Fallback for Scanned PDFs

### Current Limitation

`pdf-parse` extracts text from native PDFs but returns empty string for scanned/image-based PDFs.

### Recommended Solution

**Add Tesseract.js OCR fallback:**

```typescript
import Tesseract from "tesseract.js";

async function extractTextWithOCR(pdfBuffer: Buffer): Promise<string> {
  // Convert PDF pages to images (using pdf-to-img or similar)
  const images = await pdfToImages(pdfBuffer);

  // OCR each page
  const textBlocks = await Promise.all(
    images.map(async (image) => {
      const {
        data: { text },
      } = await Tesseract.recognize(image, "eng+hin");
      return text;
    }),
  );

  return textBlocks.join("\n\n--- Page Break ---\n\n");
}

// In extractor.ts
if (text.trim().length < 50 && mimeType === "application/pdf") {
  console.log("[Extractor] PDF appears scanned, trying OCR...");
  text = await extractTextWithOCR(buffer);
}
```

**Considerations:**

- Tesseract.js is client-side (runs in Node via node-gyp)
- Large PDFs: OCR is slow (~5s per page)
- Quality: 85–95% accuracy for printed text, lower for handwritten
- Languages: Support English + Hindi for Indian CAs

---

## 5 — Admin Dashboard & Usage Analytics

### Missing Features

**Admin endpoints (planned but not implemented):**

- `GET /api/admin/users` — List all users in firm
- `POST /api/admin/users/invite` — Send invite (see #1 above)
- `DELETE /api/admin/users/:id` — Revoke user access
- `GET /api/admin/usage` — Query count, token usage, cost stats per user
- `GET /api/admin/audit-log` — Audit log viewer with filters

**Admin UI pages:**

- `/settings/team` — User management, invites, role changes
- `/settings/usage` — Cost breakdown by user, date range, client
- `/settings/audit` — Audit log table with search/filter

**Database changes:**

- Add `AuditLog.ipAddress` and `AuditLog.userAgent` for security tracking
- Add indexes on `queries.createdAt` and `auditLogs.createdAt` for dashboard queries

---

## 6 — Rate Limiting & Cost Controls

### Current State

No rate limiting enforced. Users can:

- Spam `/api/chat` → high OpenAI costs
- Trigger multiple Gmail syncs → API quota exhaustion
- Upload unlimited documents → storage costs

### Recommended Solution

**Per-user rate limits (stored in Redis):**

```typescript
const RATE_LIMITS = {
  chat: { requests: 60, window: 3600 }, // 60 queries/hour
  sync: { requests: 10, window: 86400 }, // 10 syncs/day
  upload: { requests: 100, window: 86400 }, // 100 uploads/day
};

// Middleware
async function rateLimitMiddleware(req, res, next) {
  const key = `ratelimit:${req.user.id}:${req.path}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, RATE_LIMITS[req.route].window);
  }

  if (count > RATE_LIMITS[req.route].requests) {
    return res.status(429).json({
      success: false,
      error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests" },
    });
  }

  next();
}
```

**Per-firm cost caps:**

- Track daily LLM spend in `firms.dailySpendInr` (reset at midnight UTC)
- If exceeds `firms.spendLimitInr`, reject new `/api/chat` requests with 402 Payment Required
- Email admin when 80% of limit reached

---

## 7 — Code Quality Tooling

### Missing

- ❌ ESLint — no linting rules enforced
- ❌ Prettier — inconsistent formatting
- ❌ Husky — no pre-commit hooks
- ❌ Commitlint — no commit message validation

### Recommended Setup

**Install packages:**

```bash
pnpm add -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
pnpm add -D prettier eslint-config-prettier
pnpm add -D husky lint-staged
```

**Config files:**

- `.eslintrc.js` — TypeScript strict rules, no-unused-vars, no-console (warn)
- `.prettierrc` — 2-space indent, single quotes, trailing comma
- `.husky/pre-commit` — run `pnpm lint && pnpm typecheck`
- `package.json` → `"lint": "eslint . --ext .ts,.tsx"`

**CI integration:**

```yaml
# .github/workflows/ci.yml
- name: Lint
  run: pnpm lint
- name: Format check
  run: pnpm prettier --check .
```

---

## 8 — Enhanced Testing

### Current Coverage

121 tests passing, but missing:

- ❌ E2E tests (Playwright)
- ❌ Integration tests for BullMQ workers
- ❌ Load testing (k6)
- ❌ Frontend component tests (React Testing Library)

### Recommended Additions

**E2E tests (Playwright):**

```typescript
// tests/e2e/chat.spec.ts
test("full RAG chat flow", async ({ page }) => {
  await page.goto("http://localhost:3000/sign-in");
  await page.click("text=Sign in with Google");
  // ... OAuth mock ...
  await page.goto("http://localhost:3000/chat");
  await page.fill("textarea", "What invoices are outstanding?");
  await page.click('button:has-text("Send")');
  await expect(page.locator(".assistant-message")).toContainText("Invoice");
});
```

**Worker integration tests:**

```typescript
// Test that Gmail sync → extraction → embedding runs end-to-end
test("full pipeline integration", async () => {
  const jobId = await addGmailSyncJob({ userId: "test", firmId: "test" });

  // Wait for job completion (with timeout)
  await waitForJob(jobId, 30000);

  // Verify document created
  const docs = await prisma.document.findMany({ where: { firmId: "test" } });
  expect(docs.length).toBeGreaterThan(0);

  // Verify chunks with embeddings
  const chunks = await prisma.chunk.findMany({
    where: { documentId: docs[0].id },
  });
  expect(chunks.every((c) => c.embedding !== null)).toBe(true);
});
```

---

## 9 — Deployment & Infrastructure

### Current State

- ✅ Docker Compose for local dev
- ✅ Dockerfiles for API + Web
- ❌ No production deployment scripts
- ❌ No Terraform/CDK for AWS infra
- ❌ No CI/CD pipeline

### Recommended Next Steps

**GitHub Actions CI/CD:**

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to ECS
        run: |
          aws ecs update-service --cluster ai-accounting-prod \
            --service api --force-new-deployment
```

**Terraform for AWS:**

- VPC + subnets (public/private)
- RDS PostgreSQL 16 (db.t4g.medium, Multi-AZ)
- ElastiCache Redis (cache.t4g.micro)
- ECS Fargate (API + Web + Workers)
- S3 bucket (documents)
- CloudFront CDN
- Route 53 (DNS)
- ACM (SSL certificates)

---

## Priority Order (Recommended)

| Priority | Feature                         | Effort | Impact   | Timeline   |
| -------- | ------------------------------- | ------ | -------- | ---------- |
| P0       | Multi-user firm onboarding (#1) | High   | Critical | Week 11–12 |
| P0       | Production auth hardening (#2)  | Medium | Critical | Week 11    |
| P1       | Admin dashboard (#5)            | Medium | High     | Week 12–13 |
| P1       | Rate limiting (#6)              | Low    | High     | Week 11    |
| P2       | Gmail send integration (#3)     | Low    | Medium   | Week 13    |
| P2       | ESLint + Prettier (#7)          | Low    | Medium   | Week 11    |
| P3       | OCR fallback (#4)               | Medium | Low      | Week 14+   |
| P3       | E2E tests (#8)                  | Medium | Medium   | Week 13–14 |
| P3       | CI/CD + Terraform (#9)          | High   | High     | Week 15+   |

---

## References

- [PRD.md](./PRD.md) — Product requirements
- [architecture.md](./architecture.md) — System architecture
- [currentState.md](./.github/currentState.md) — Implementation status
