/**
 * Integration tests for API endpoints using supertest.
 *
 * Uses the `X-Dev-User` header for auth bypass in development mode.
 * Tests exercise the full Express middleware stack (CORS, auth, validation,
 * error handling) without hitting external services (Google, OpenAI).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import app from "../app";

// ─── Mock external dependencies ──────────────────────────────────

// Mock Redis (used by rate limiter + auth blacklist)
const mockMulti = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([
    [null, 1],
    [null, 1],
  ]),
};

vi.mock("../lib/redis", () => ({
  getRedis: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(-2),
    set: vi.fn().mockResolvedValue("OK"),
    multi: vi.fn(() => mockMulti),
  })),
  getRedisSubscriber: vi.fn(() => ({
    subscribe: vi.fn(),
    on: vi.fn(),
  })),
}));

// Mock Prisma
vi.mock("../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockRejectedValue(new Error("Not found")),
    },
    firm: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    document: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: "doc-123" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    chunk: {
      count: vi.fn().mockResolvedValue(0),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    query: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "q-123" }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    client: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: "client-123",
        name: "Test Client",
        identifier: "TC001",
        firmId: "firm-xyz",
      }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    syncJob: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "sync-123" }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
  },
}));

// ─── Test fixtures ───────────────────────────────────────────────

const DEV_USER = JSON.stringify({
  userId: "user-abc-123",
  firmId: "firm-xyz-456",
  email: "test@example.com",
  role: "admin",
});

const DEV_MEMBER = JSON.stringify({
  userId: "user-member-123",
  firmId: "firm-xyz-456",
  email: "member@example.com",
  role: "member",
});

// ─── Setup ───────────────────────────────────────────────────────

beforeAll(() => {
  process.env.NODE_ENV = "development";
  process.env.JWT_SECRET = "a".repeat(128);
});

afterAll(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════
// Health
// ═══════════════════════════════════════════════════════════════════

describe("GET /api/health", () => {
  it("returns 200 with status healthy", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("healthy");
  });

  it("includes a timestamp", async () => {
    const res = await request(app).get("/api/health");
    expect(res.body.data).toHaveProperty("timestamp");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Auth
// ═══════════════════════════════════════════════════════════════════

describe("Auth routes", () => {
  describe("GET /api/auth/google", () => {
    it("redirects to Google OAuth (302)", async () => {
      process.env.GOOGLE_CLIENT_ID = "test-client-id";
      process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
      process.env.GOOGLE_REDIRECT_URI = "http://localhost:4000/api/auth/google/callback";
      const res = await request(app).get("/api/auth/google");
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("accounts.google.com");
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns 401 without auth", async () => {
      process.env.NODE_ENV = "production";
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
      process.env.NODE_ENV = "development";
    });

    it("returns user data with X-Dev-User header", async () => {
      const { prisma } = await import("../lib/prisma");
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "user-abc-123",
        email: "test@example.com",
        name: "Test User",
        role: "admin",
        lastSyncAt: null,
        firm: { id: "firm-xyz-456", name: "Test Firm", slug: "test-firm", plan: "trial" },
      } as never);

      const res = await request(app).get("/api/auth/me").set("X-Dev-User", DEV_USER);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("returns 200 on logout with dev user", async () => {
      const res = await request(app).post("/api/auth/logout").set("X-Dev-User", DEV_USER);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Documents
// ═══════════════════════════════════════════════════════════════════

describe("Documents routes", () => {
  describe("GET /api/documents", () => {
    it("returns 401 without auth", async () => {
      process.env.NODE_ENV = "production";
      const res = await request(app).get("/api/documents");
      expect(res.status).toBe(401);
      process.env.NODE_ENV = "development";
    });

    it("returns paginated document list", async () => {
      const res = await request(app).get("/api/documents").set("X-Dev-User", DEV_USER);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("pagination");
      expect(res.body.pagination).toHaveProperty("page", 1);
    });

    it("accepts page and pageSize query params", async () => {
      const res = await request(app)
        .get("/api/documents?page=2&pageSize=5")
        .set("X-Dev-User", DEV_USER);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.pageSize).toBe(5);
    });
  });

  describe("GET /api/documents/:id", () => {
    it("returns 404 for non-existent document", async () => {
      const res = await request(app)
        .get("/api/documents/non-existent-id")
        .set("X-Dev-User", DEV_USER);

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/documents/thread/:threadId", () => {
    it("returns 404 when no emails in thread", async () => {
      const res = await request(app)
        .get("/api/documents/thread/thread-abc-123")
        .set("X-Dev-User", DEV_USER);

      expect(res.status).toBe(404);
    });

    it("returns thread summary when emails exist", async () => {
      const { prisma } = await import("../lib/prisma");
      const mockDocs = [
        {
          id: "doc-1",
          filename: "RE: Invoice",
          sourceId: "gmail-1",
          textExcerpt: "Hello, please find attached...",
          sourceDate: new Date("2026-01-15"),
          status: "ready",
          summary: "Invoice follow-up",
        },
        {
          id: "doc-2",
          filename: "RE: RE: Invoice",
          sourceId: "gmail-2",
          textExcerpt: "Thank you for sending...",
          sourceDate: new Date("2026-01-16"),
          status: "ready",
          summary: null,
        },
      ];
      vi.mocked(prisma.document.findMany).mockResolvedValueOnce(mockDocs as never);

      const res = await request(app)
        .get("/api/documents/thread/thread-abc-123")
        .set("X-Dev-User", DEV_USER);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.threadId).toBe("thread-abc-123");
      expect(res.body.data.messageCount).toBe(2);
      expect(res.body.data.messages).toHaveLength(2);
      expect(res.body.data.dateRange).toHaveProperty("earliest");
      expect(res.body.data.dateRange).toHaveProperty("latest");
    });
  });

  describe("POST /api/documents/upload", () => {
    it("returns 400 without file", async () => {
      const res = await request(app)
        .post("/api/documents/upload")
        .set("X-Dev-User", DEV_USER);

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/documents", () => {
    it("deletes all firm documents", async () => {
      const res = await request(app).delete("/api/documents").set("X-Dev-User", DEV_USER);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Chat
// ═══════════════════════════════════════════════════════════════════

describe("Chat routes", () => {
  describe("POST /api/chat", () => {
    it("returns 401 without auth", async () => {
      process.env.NODE_ENV = "production";
      const res = await request(app).post("/api/chat").send({ query: "What is GST?" });
      expect(res.status).toBe(401);
      process.env.NODE_ENV = "development";
    });

    it("returns 400 with empty query", async () => {
      const res = await request(app)
        .post("/api/chat")
        .set("X-Dev-User", DEV_USER)
        .send({ query: "" });

      expect(res.status).toBe(400);
    });

    it("returns 400 with missing query field", async () => {
      const res = await request(app)
        .post("/api/chat")
        .set("X-Dev-User", DEV_USER)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/chat/history", () => {
    it("returns query history", async () => {
      const res = await request(app).get("/api/chat/history").set("X-Dev-User", DEV_USER);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("POST /api/chat/:queryId/feedback", () => {
    it("returns 400 with invalid feedback value", async () => {
      const res = await request(app)
        .post("/api/chat/query-123/feedback")
        .set("X-Dev-User", DEV_USER)
        .send({ feedback: "invalid" });

      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent query", async () => {
      const res = await request(app)
        .post("/api/chat/non-existent/feedback")
        .set("X-Dev-User", DEV_USER)
        .send({ feedback: "positive" });

      expect(res.status).toBe(404);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Drafts
// ═══════════════════════════════════════════════════════════════════

describe("Drafts routes", () => {
  describe("POST /api/drafts", () => {
    it("returns 401 without auth", async () => {
      process.env.NODE_ENV = "production";
      const res = await request(app)
        .post("/api/drafts")
        .send({ instructions: "Write an email" });
      expect(res.status).toBe(401);
      process.env.NODE_ENV = "development";
    });

    it("returns 400 with empty instructions", async () => {
      const res = await request(app)
        .post("/api/drafts")
        .set("X-Dev-User", DEV_USER)
        .send({ instructions: "" });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/drafts/refine", () => {
    it("returns 400 with missing draftText", async () => {
      const res = await request(app)
        .post("/api/drafts/refine")
        .set("X-Dev-User", DEV_USER)
        .send({ instructions: "Make it shorter" });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/drafts/send", () => {
    it("returns 400 with invalid email", async () => {
      const res = await request(app)
        .post("/api/drafts/send")
        .set("X-Dev-User", DEV_USER)
        .send({ to: "not-an-email", subject: "Test", body: "Hello" });

      expect(res.status).toBe(400);
    });

    it("returns 400 with missing subject", async () => {
      const res = await request(app)
        .post("/api/drafts/send")
        .set("X-Dev-User", DEV_USER)
        .send({ to: "test@example.com", body: "Hello" });

      expect(res.status).toBe(400);
    });

    it("returns 400 with empty body", async () => {
      const res = await request(app)
        .post("/api/drafts/send")
        .set("X-Dev-User", DEV_USER)
        .send({ to: "test@example.com", subject: "Test", body: "" });

      expect(res.status).toBe(400);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Clients
// ═══════════════════════════════════════════════════════════════════

describe("Clients routes", () => {
  describe("GET /api/clients", () => {
    it("returns 401 without auth", async () => {
      process.env.NODE_ENV = "production";
      const res = await request(app).get("/api/clients");
      expect(res.status).toBe(401);
      process.env.NODE_ENV = "development";
    });

    it("returns client list", async () => {
      const res = await request(app).get("/api/clients").set("X-Dev-User", DEV_USER);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("POST /api/clients", () => {
    it("creates a new client", async () => {
      const res = await request(app)
        .post("/api/clients")
        .set("X-Dev-User", DEV_USER)
        .send({ name: "Acme Corp", identifier: "ACME001" });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it("returns 400 with missing name", async () => {
      const res = await request(app)
        .post("/api/clients")
        .set("X-Dev-User", DEV_USER)
        .send({ identifier: "ACME001" });

      expect(res.status).toBe(400);
    });

    it("returns 400 with missing identifier", async () => {
      const res = await request(app)
        .post("/api/clients")
        .set("X-Dev-User", DEV_USER)
        .send({ name: "Acme Corp" });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/clients/:id/summary", () => {
    it("returns 404 for non-existent client", async () => {
      const res = await request(app)
        .get("/api/clients/non-existent/summary")
        .set("X-Dev-User", DEV_USER);

      expect(res.status).toBe(404);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Sync
// ═══════════════════════════════════════════════════════════════════

describe("Sync routes", () => {
  describe("GET /api/sync/status", () => {
    it("returns sync job list", async () => {
      const res = await request(app).get("/api/sync/status").set("X-Dev-User", DEV_USER);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Error handling
// ═══════════════════════════════════════════════════════════════════

describe("Error handling", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/api/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns proper JSON error envelope", async () => {
    process.env.NODE_ENV = "production";
    const res = await request(app)
      .get("/api/documents")
      .set("Accept", "application/json");
    // Should be 401 since no auth in production
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("success", false);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toHaveProperty("message");
    process.env.NODE_ENV = "development";
  });
});
