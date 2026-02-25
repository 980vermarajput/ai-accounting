import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist mockCreate so it's accessible inside the vi.mock factory ──────────
// vi.hoisted() ensures this runs before the factory, which is itself hoisted.

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function () {
    // Regular function (not arrow) so `new OpenAI(...)` works correctly
    return { embeddings: { create: mockCreate } };
  }),
}));

import { embedChunks, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "./embedder";

// ─── Helpers ─────────────────────────────────────────────────────

// Build a minimal fake OpenAI embeddings response for N items
function fakeResponse(count: number) {
  return {
    data: Array.from({ length: count }, (_, i) => ({
      index: i,
      embedding: Array.from(
        { length: EMBEDDING_DIMENSIONS },
        (__, j) => (i + 1) * 0.001 + j * 0.0001,
      ),
    })),
    model: EMBEDDING_MODEL,
    usage: { prompt_tokens: count * 5, total_tokens: count * 5 },
  };
}

// ─── embedChunks ─────────────────────────────────────────────────

describe("embedChunks", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    mockCreate.mockReset();
  });

  // ── Happy path ────────────────────────────────────────────────

  it("returns an empty array when given no chunks", async () => {
    const results = await embedChunks([]);
    expect(results).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("calls the OpenAI API once for a small batch and returns embeddings", async () => {
    const chunks = [
      { chunkId: "id-1", chunkText: "GST filing deadline is the 20th." },
      { chunkId: "id-2", chunkText: "TDS must be deducted at source." },
    ];
    mockCreate.mockResolvedValueOnce(fakeResponse(2));

    const results = await embedChunks(chunks);

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(results).toHaveLength(2);
    expect(results[0].chunkId).toBe("id-1");
    expect(results[1].chunkId).toBe("id-2");
  });

  it("returns a 1536-dimensional vector for each chunk", async () => {
    const chunks = [
      { chunkId: "id-a", chunkText: "Income from house property." },
    ];
    mockCreate.mockResolvedValueOnce(fakeResponse(1));

    const results = await embedChunks(chunks);

    expect(results[0].embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(typeof results[0].embedding[0]).toBe("number");
  });

  it("preserves chunkId ↔ embedding order from the API response", async () => {
    const chunks = [
      { chunkId: "first", chunkText: "A" },
      { chunkId: "second", chunkText: "B" },
      { chunkId: "third", chunkText: "C" },
    ];
    mockCreate.mockResolvedValueOnce(fakeResponse(3));

    const results = await embedChunks(chunks);

    expect(results.map((r) => r.chunkId)).toEqual(["first", "second", "third"]);
  });

  // ── Batching ──────────────────────────────────────────────────

  it("splits 150 chunks into two batches of 100 and 50", async () => {
    const chunks = Array.from({ length: 150 }, (_, i) => ({
      chunkId: `id-${i}`,
      chunkText: `Sentence number ${i}.`,
    }));

    mockCreate.mockResolvedValueOnce(fakeResponse(100)); // first batch
    mockCreate.mockResolvedValueOnce(fakeResponse(50)); // second batch

    const results = await embedChunks(chunks);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(150);
    expect(results[0].chunkId).toBe("id-0");
    expect(results[149].chunkId).toBe("id-149");
  });

  it("sends exactly 100 items to the API when batch is exactly 100", async () => {
    const chunks = Array.from({ length: 100 }, (_, i) => ({
      chunkId: `id-${i}`,
      chunkText: `Text ${i}`,
    }));
    mockCreate.mockResolvedValueOnce(fakeResponse(100));

    await embedChunks(chunks);

    expect(mockCreate).toHaveBeenCalledOnce();
    const [call] = mockCreate.mock.calls;
    expect((call[0] as { input: string[] }).input).toHaveLength(100);
  });

  // ── API call shape ────────────────────────────────────────────

  it("requests the correct model and dimension in the API call", async () => {
    const chunks = [{ chunkId: "x", chunkText: "audit report" }];
    mockCreate.mockResolvedValueOnce(fakeResponse(1));

    await embedChunks(chunks);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    );
  });

  // ── Error propagation ─────────────────────────────────────────

  it("propagates OpenAI API errors to the caller", async () => {
    const chunks = [{ chunkId: "err-id", chunkText: "Some text." }];
    mockCreate.mockRejectedValueOnce(new Error("OpenAI rate limit exceeded"));

    await expect(embedChunks(chunks)).rejects.toThrow(
      "OpenAI rate limit exceeded",
    );
  });
});
