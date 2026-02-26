/**
 * Unit tests for rag.ts
 *
 * Strategy:
 *  - `embedChunks` is mocked to avoid real OpenAI calls during retrieval tests.
 *  - `prisma.$queryRaw` is mocked for pgvector search tests.
 *  - The OpenAI completions client is mocked via vi.hoisted + vi.mock for
 *    `generateRagAnswer` tests.
 *
 * We deliberately keep the mock boundary at module level to keep tests fast
 * and deterministic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist OpenAI completions mock ───────────────────────────────
// Must be hoisted so it's available inside the vi.mock factory AND can be
// reset between tests.

const mockCompletionCreate = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      chat: {
        completions: {
          create: mockCompletionCreate,
        },
      },
      // Embeddings interface also referenced by embedder.ts but rag.ts
      // doesn't call it directly — the embedder module handles this.
      embeddings: { create: vi.fn() },
    };
  }),
}));

// ─── Mock embedder ───────────────────────────────────────────────

vi.mock("./embedder", () => ({
  embedChunks: vi.fn(),
  EMBEDDING_MODEL: "text-embedding-3-small",
  EMBEDDING_DIMENSIONS: 1536,
}));

// ─── Mock Prisma ─────────────────────────────────────────────────

vi.mock("./prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    firm: {
      findUnique: vi.fn(),
    },
  },
}));

// ─── Imports (after mocks are registered) ────────────────────────

import { embedChunks } from "./embedder";
import { prisma } from "./prisma";
import {
  searchChunks,
  generateRagAnswer,
  SIMILARITY_THRESHOLD,
  DEFAULT_LIMIT,
  RECENCY_SCALE_DAYS,
} from "./rag";

// ─── Helpers ─────────────────────────────────────────────────────

const FIRM_ID = "aaaaaaaa-0000-0000-0000-000000000001";

/** Fake query embedding result */
function fakeQueryEmbedding(dims = 3) {
  return [{ chunkId: "query", embedding: Array(dims).fill(0.1) }];
}

/**
 * Build a fake ChunkRow as returned by prisma.$queryRaw.
 * `dayAgo` controls how many days old the document is.
 */
function fakeRow(
  id: string,
  similarity: number,
  dayAgo = 0,
  docId = `doc-${id}`,
) {
  const sourceDate = new Date(Date.now() - dayAgo * 24 * 60 * 60 * 1000);
  return {
    chunk_id: id,
    chunk_text: `text for chunk ${id}`,
    document_id: docId,
    filename: `file-${id}.pdf`,
    source: "gmail",
    source_date: sourceDate,
    similarity,
  };
}

/** Build a minimal OpenAI chat completion response. */
function fakeCompletion(
  content: string,
  promptTokens = 100,
  completionTokens = 50,
) {
  return {
    choices: [{ message: { content } }],
    model: "gpt-4o-mini",
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

// ─── searchChunks ─────────────────────────────────────────────────

describe("searchChunks", () => {
  const mockEmbed = vi.mocked(embedChunks);
  const mockQuery = vi.mocked(prisma.$queryRaw);

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test";
    mockEmbed.mockReset();
    mockQuery.mockReset();
  });

  it("returns empty array when embedChunks returns nothing", async () => {
    mockEmbed.mockResolvedValueOnce([]);

    const results = await searchChunks("query", FIRM_ID);

    expect(results).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns empty array when pgvector returns no rows", async () => {
    mockEmbed.mockResolvedValueOnce(fakeQueryEmbedding());
    mockQuery.mockResolvedValueOnce([]);

    const results = await searchChunks("query", FIRM_ID);

    expect(results).toEqual([]);
  });

  it("filters out rows below the similarity threshold", async () => {
    mockEmbed.mockResolvedValueOnce(fakeQueryEmbedding());
    mockQuery.mockResolvedValueOnce([
      fakeRow("c1", 0.85), // above threshold (0.55)
      fakeRow("c2", 0.3), // below threshold — should be excluded
      fakeRow("c3", 0.55), // exactly at threshold — should be included
    ]);

    const results = await searchChunks("query", FIRM_ID);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.chunkId)).toEqual(
      expect.arrayContaining(["c1", "c3"]),
    );
    expect(results.find((r) => r.chunkId === "c2")).toBeUndefined();
  });

  it("returns empty array when all rows are below threshold", async () => {
    mockEmbed.mockResolvedValueOnce(fakeQueryEmbedding());
    mockQuery.mockResolvedValueOnce([fakeRow("c1", 0.2), fakeRow("c2", 0.3)]);

    const results = await searchChunks("query", FIRM_ID, {
      threshold: SIMILARITY_THRESHOLD,
    });

    expect(results).toEqual([]);
  });

  it("applies recency weighting: newer document scores higher than older one with same similarity", async () => {
    mockEmbed.mockResolvedValueOnce(fakeQueryEmbedding());
    mockQuery.mockResolvedValueOnce([
      fakeRow("old", 0.9, 400), // 400 days old
      fakeRow("new", 0.9, 1), // 1 day old — same similarity but higher score
    ]);

    const results = await searchChunks("query", FIRM_ID);

    expect(results).toHaveLength(2);
    expect(results[0].chunkId).toBe("new");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("sorts results by weighted score descending", async () => {
    mockEmbed.mockResolvedValueOnce(fakeQueryEmbedding());
    mockQuery.mockResolvedValueOnce([
      fakeRow("a", 0.75, 100),
      fakeRow("b", 0.95, 10),
      fakeRow("c", 0.8, 5),
    ]);

    const results = await searchChunks("query", FIRM_ID);

    // Scores should be descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("respects the limit option", async () => {
    mockEmbed.mockResolvedValueOnce(fakeQueryEmbedding());
    const rows = Array.from({ length: 15 }, (_, i) => fakeRow(`c${i}`, 0.8, i));
    mockQuery.mockResolvedValueOnce(rows);

    const results = await searchChunks("query", FIRM_ID, { limit: 5 });

    expect(results).toHaveLength(5);
  });

  it("returns at most DEFAULT_LIMIT results by default", async () => {
    mockEmbed.mockResolvedValueOnce(fakeQueryEmbedding());
    const rows = Array.from({ length: 20 }, (_, i) => fakeRow(`c${i}`, 0.8, i));
    mockQuery.mockResolvedValueOnce(rows);

    const results = await searchChunks("query", FIRM_ID);

    expect(results.length).toBeLessThanOrEqual(DEFAULT_LIMIT);
  });

  it("maps row fields to SearchResult correctly", async () => {
    mockEmbed.mockResolvedValueOnce(fakeQueryEmbedding());
    const row = fakeRow("chunk-1", 0.85, 30, "doc-abc");
    mockQuery.mockResolvedValueOnce([row]);

    const [result] = await searchChunks("query", FIRM_ID);

    expect(result.chunkId).toBe("chunk-1");
    expect(result.documentId).toBe("doc-abc");
    expect(result.filename).toBe("file-chunk-1.pdf");
    expect(result.source).toBe("gmail");
    expect(result.similarity).toBeCloseTo(0.85);
    expect(result.chunkText).toBe("text for chunk chunk-1");
    expect(result.sourceDate).toBeInstanceOf(Date);
    expect(result.score).toBeLessThanOrEqual(result.similarity);
  });

  it("score equals similarity for a document aged exactly 0 days", async () => {
    mockEmbed.mockResolvedValueOnce(fakeQueryEmbedding());
    mockQuery.mockResolvedValueOnce([fakeRow("c1", 0.9, 0)]);

    const [result] = await searchChunks("query", FIRM_ID);

    // age = 0 → recencyFactor = 1 / (1 + 0/365) = 1.0 → score = similarity
    expect(result.score).toBeCloseTo(result.similarity);
  });

  it("score is roughly half of similarity for a document 365 days old", async () => {
    mockEmbed.mockResolvedValueOnce(fakeQueryEmbedding());
    mockQuery.mockResolvedValueOnce([fakeRow("c1", 0.9, RECENCY_SCALE_DAYS)]);

    const [result] = await searchChunks("query", FIRM_ID);

    // age = 365 → recencyFactor = 1 / (1 + 1) = 0.5 → score ≈ similarity * 0.5
    expect(result.score).toBeCloseTo(result.similarity * 0.5, 1);
  });
});

// ─── generateRagAnswer ───────────────────────────────────────────

describe("generateRagAnswer", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test";
    mockCompletionCreate.mockReset();
  });

  it("calls the OpenAI chat completions API with the query", async () => {
    const content = JSON.stringify({
      answer: "The GST rate is 18%.",
      suggestedFollowups: [
        "What about input credit?",
        "When is it due?",
        "Can we claim exemption?",
      ],
    });
    mockCompletionCreate.mockResolvedValueOnce(fakeCompletion(content));

    await generateRagAnswer("What is the GST rate?", []);

    expect(mockCompletionCreate).toHaveBeenCalledOnce();
    const [call] = mockCompletionCreate.mock.calls;
    const opts = call[0] as {
      model: string;
      messages: { role: string; content: string }[];
    };
    expect(opts.model).toBe("gpt-4o-mini");
    expect(opts.messages[0].role).toBe("system");
    expect(opts.messages[1].role).toBe("user");
  });

  it("parses JSON response and returns answer + followups", async () => {
    const content = JSON.stringify({
      answer: "Total GST for Q3 is ₹1,23,456.",
      suggestedFollowups: ["Q4 GST?", "Input credit?", "Filing date?"],
    });
    mockCompletionCreate.mockResolvedValueOnce(fakeCompletion(content));

    const result = await generateRagAnswer("What is the Q3 GST?", []);

    expect(result.answer).toBe("Total GST for Q3 is ₹1,23,456.");
    expect(result.suggestedFollowups).toEqual([
      "Q4 GST?",
      "Input credit?",
      "Filing date?",
    ]);
    expect(result.model).toBe("gpt-4o-mini");
    expect(result.tokensPrompt).toBe(100);
    expect(result.tokensCompletion).toBe(50);
  });

  it("falls back gracefully when LLM returns invalid JSON", async () => {
    mockCompletionCreate.mockResolvedValueOnce(
      fakeCompletion("This is a plain text answer, not JSON."),
    );

    const result = await generateRagAnswer("What is the tax rate?", []);

    expect(result.answer).toBe("This is a plain text answer, not JSON.");
    expect(result.suggestedFollowups).toEqual([]);
  });

  it("handles empty LLM response gracefully", async () => {
    mockCompletionCreate.mockResolvedValueOnce(fakeCompletion(""));

    const result = await generateRagAnswer("query", []);

    expect(typeof result.answer).toBe("string");
    expect(result.suggestedFollowups).toEqual([]);
  });

  it("caps suggestedFollowups at 3 even if LLM returns more", async () => {
    const content = JSON.stringify({
      answer: "Some answer.",
      suggestedFollowups: ["q1", "q2", "q3", "q4", "q5"],
    });
    mockCompletionCreate.mockResolvedValueOnce(fakeCompletion(content));

    const result = await generateRagAnswer("query", []);

    expect(result.suggestedFollowups).toHaveLength(3);
  });

  it("computes a non-zero costInr based on token usage", async () => {
    const content = JSON.stringify({
      answer: "Answer.",
      suggestedFollowups: [],
    });
    // 1000 prompt tokens + 500 completion tokens
    mockCompletionCreate.mockResolvedValueOnce(
      fakeCompletion(content, 1000, 500),
    );

    const result = await generateRagAnswer("query", []);

    // cost = (1000/1M * 0.15 + 500/1M * 0.60) * 84
    // = (0.00015 + 0.0003) * 84 = 0.00045 * 84 ≈ 0.0378
    expect(result.costInr).toBeGreaterThan(0);
    expect(result.costInr).toBeCloseTo(0.0378, 3);
  });

  it("includes chunk filenames in the user message when chunks are provided", async () => {
    const content = JSON.stringify({
      answer: "Found it.",
      suggestedFollowups: [],
    });
    mockCompletionCreate.mockResolvedValueOnce(fakeCompletion(content));

    const chunks = [
      {
        chunkId: "c1",
        chunkText: "Revenue for Q3 was ₹50 lakh.",
        documentId: "d1",
        filename: "ledger_q3.xlsx",
        source: "drive" as const,
        sourceDate: new Date("2024-09-30"),
        similarity: 0.9,
        score: 0.85,
      },
    ];

    await generateRagAnswer("What is Q3 revenue?", chunks);

    const [call] = mockCompletionCreate.mock.calls;
    const opts = call[0] as { messages: { role: string; content: string }[] };
    const userMessage = opts.messages[1].content;
    expect(userMessage).toContain("ledger_q3.xlsx");
    expect(userMessage).toContain("Revenue for Q3 was ₹50 lakh.");
  });
});
