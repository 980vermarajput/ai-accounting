/**
 * Unit tests for briefing-generator.ts
 *
 * Strategy:
 *  - OpenAI is mocked via vi.hoisted
 *  - Prisma is mocked at module level
 *  - Redis is mocked
 *  - Tests verify idempotency, caching, and LLM call
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist OpenAI mock ──────────────────────────────────────────

const mockCompletionCreate = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      chat: {
        completions: {
          create: mockCompletionCreate,
        },
      },
    };
  }),
}));

// ─── Mock Prisma ────────────────────────────────────────────────

vi.mock("./prisma", () => ({
  prisma: {
    dailyBriefing: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    alert: {
      findMany: vi.fn(),
    },
    client: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    document: {
      count: vi.fn(),
    },
    query: {
      count: vi.fn(),
    },
  },
}));

// ─── Mock Redis ─────────────────────────────────────────────────

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();

vi.mock("./redis", () => ({
  getRedis: () => ({
    get: mockRedisGet,
    set: mockRedisSet,
  }),
}));

// ─── Mock token-usage ───────────────────────────────────────────

vi.mock("./token-usage", () => ({
  checkTokenLimit: vi.fn(),
  recordTokenUsage: vi.fn(),
  calculateCostInr: vi.fn().mockReturnValue(0.05),
}));

// ─── Mock Logger ────────────────────────────────────────────────

vi.mock("./logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    tokenUsage: vi.fn(),
  },
}));

// ─── Imports (after mocks) ──────────────────────────────────────

import { prisma } from "./prisma";
import { generateDailyBriefing } from "./briefing-generator";

const FIRM_ID = "firm-001";

describe("briefing-generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "sk-test-key";
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue("OK");
  });

  // ── Idempotency: DB hit ───────────────────────────────────

  it("returns existing briefing from DB without calling LLM", async () => {
    const existing = {
      id: "briefing-1",
      firmId: FIRM_ID,
      date: new Date(),
      summary: "All is well.",
      clientCount: 5,
      alertCount: 0,
      metadata: {},
      createdAt: new Date(),
    };

    vi.mocked(prisma.dailyBriefing.findUnique).mockResolvedValue(existing as any);

    const result = await generateDailyBriefing(FIRM_ID);

    expect(result.id).toBe("briefing-1");
    expect(result.summary).toBe("All is well.");
    expect(mockCompletionCreate).not.toHaveBeenCalled();
  });

  // ── Idempotency: Redis hit ────────────────────────────────

  it("returns cached briefing from Redis when DB misses", async () => {
    vi.mocked(prisma.dailyBriefing.findUnique).mockResolvedValue(null);

    const cached = JSON.stringify({
      id: "briefing-cached",
      firmId: FIRM_ID,
      date: new Date().toISOString(),
      summary: "Cached briefing.",
      clientCount: 3,
      alertCount: 1,
      metadata: {},
      createdAt: new Date().toISOString(),
    });
    mockRedisGet.mockResolvedValue(cached);

    const result = await generateDailyBriefing(FIRM_ID);

    expect(result.id).toBe("briefing-cached");
    expect(result.summary).toBe("Cached briefing.");
    expect(mockCompletionCreate).not.toHaveBeenCalled();
  });

  // ── Fresh generation ──────────────────────────────────────

  it("calls OpenAI and stores briefing when no cache exists", async () => {
    // No DB or Redis cache
    vi.mocked(prisma.dailyBriefing.findUnique).mockResolvedValue(null);

    // Context data
    vi.mocked(prisma.alert.findMany).mockResolvedValue([]);
    vi.mocked(prisma.client.count).mockResolvedValue(10);
    vi.mocked(prisma.document.count).mockResolvedValue(25);
    vi.mocked(prisma.query.count).mockResolvedValue(8);
    vi.mocked(prisma.client.findMany).mockResolvedValue([
      {
        name: "Mehta Traders",
        _count: { documents: 5 },
      } as any,
    ]);

    // LLM response
    mockCompletionCreate.mockResolvedValue({
      choices: [{ message: { content: "Today's summary: everything is great." } }],
      usage: { prompt_tokens: 200, completion_tokens: 80 },
    });

    const createdBriefing = {
      id: "briefing-new",
      firmId: FIRM_ID,
      date: new Date(),
      summary: "Today's summary: everything is great.",
      clientCount: 10,
      alertCount: 0,
      metadata: { model: "gpt-4o-mini" },
      createdAt: new Date(),
    };
    vi.mocked(prisma.dailyBriefing.create).mockResolvedValue(createdBriefing as any);

    const result = await generateDailyBriefing(FIRM_ID);

    expect(mockCompletionCreate).toHaveBeenCalledOnce();
    expect(vi.mocked(prisma.dailyBriefing.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firmId: FIRM_ID,
          summary: "Today's summary: everything is great.",
          clientCount: 10,
        }),
      }),
    );
    expect(result.summary).toBe("Today's summary: everything is great.");
  });

  // ── Redis cache write ─────────────────────────────────────

  it("caches the new briefing in Redis after generation", async () => {
    vi.mocked(prisma.dailyBriefing.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.alert.findMany).mockResolvedValue([]);
    vi.mocked(prisma.client.count).mockResolvedValue(0);
    vi.mocked(prisma.document.count).mockResolvedValue(0);
    vi.mocked(prisma.query.count).mockResolvedValue(0);
    vi.mocked(prisma.client.findMany).mockResolvedValue([]);

    mockCompletionCreate.mockResolvedValue({
      choices: [{ message: { content: "Short briefing." } }],
      usage: { prompt_tokens: 100, completion_tokens: 30 },
    });

    vi.mocked(prisma.dailyBriefing.create).mockResolvedValue({
      id: "briefing-x",
      firmId: FIRM_ID,
      date: new Date(),
      summary: "Short briefing.",
      clientCount: 0,
      alertCount: 0,
      metadata: {},
      createdAt: new Date(),
    } as any);

    await generateDailyBriefing(FIRM_ID);

    // Redis set should have been called with TTL
    expect(mockRedisSet).toHaveBeenCalledWith(
      expect.stringContaining(`briefing:${FIRM_ID}`),
      expect.any(String),
      "EX",
      expect.any(Number),
    );
  });
});
