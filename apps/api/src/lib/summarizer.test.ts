/**
 * Unit tests for summarizer.ts
 *
 * Strategy:
 *  - OpenAI is mocked to avoid real API calls.
 *  - Prisma is mocked to test database interactions.
 *  - Tests cover both `generateDocumentSummary` and `rebuildFirmSnapshot`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist OpenAI mock ───────────────────────────────────────────

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

// ─── Mock Prisma ─────────────────────────────────────────────────

const mockDocFindMany = vi.hoisted(() => vi.fn());
const mockFirmUpdate = vi.hoisted(() => vi.fn());

vi.mock("./prisma", () => ({
  prisma: {
    document: {
      findMany: mockDocFindMany,
    },
    firm: {
      update: mockFirmUpdate,
    },
  },
}));

// ─── Imports (after mocks) ───────────────────────────────────────

import { generateDocumentSummary, rebuildFirmSnapshot } from "./summarizer";

// ─── Helpers ─────────────────────────────────────────────────────

const FIRM_ID = "aaaaaaaa-0000-0000-0000-000000000001";

/** Build a fake OpenAI completion response. */
function fakeCompletion(content: string) {
  return {
    choices: [{ message: { content } }],
    model: "gpt-4o-mini",
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

// ─── generateDocumentSummary ─────────────────────────────────────

describe("generateDocumentSummary", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test";
    mockCompletionCreate.mockReset();
  });

  it("returns null for text shorter than 50 characters", async () => {
    const result = await generateDocumentSummary(
      "short",
      "test.pdf",
      "application/pdf",
    );
    expect(result).toBeNull();
    expect(mockCompletionCreate).not.toHaveBeenCalled();
  });

  it("returns null for empty text", async () => {
    const result = await generateDocumentSummary(
      "",
      "test.pdf",
      "application/pdf",
    );
    expect(result).toBeNull();
  });

  it("calls OpenAI and returns parsed summary + entities", async () => {
    const llmResponse = {
      summary:
        "This is a GST return for Mehta Traders for Q3 FY 2023-24. Total GST liability is ₹45,000.",
      entities: {
        clients: ["Mehta Traders"],
        amounts: ["₹45,000"],
        dates: ["Q3 FY 2023-24"],
        documentType: "gst-return",
        gstNumbers: ["27AABCU9603R1ZM"],
        panNumbers: [],
      },
    };
    mockCompletionCreate.mockResolvedValueOnce(
      fakeCompletion(JSON.stringify(llmResponse)),
    );

    const result = await generateDocumentSummary(
      "A".repeat(100), // long enough text
      "gst_return_q3.pdf",
      "application/pdf",
    );

    expect(result).not.toBeNull();
    expect(result!.summary).toBe(llmResponse.summary);
    expect(result!.entities.clients).toEqual(["Mehta Traders"]);
    expect(result!.entities.documentType).toBe("gst-return");
    expect(result!.entities.gstNumbers).toEqual(["27AABCU9603R1ZM"]);
  });

  it("returns null when LLM returns invalid JSON", async () => {
    mockCompletionCreate.mockResolvedValueOnce(
      fakeCompletion("This is not JSON at all"),
    );

    const result = await generateDocumentSummary(
      "A".repeat(100),
      "test.pdf",
      "application/pdf",
    );

    expect(result).toBeNull();
  });

  it("returns null when LLM returns JSON without required fields", async () => {
    mockCompletionCreate.mockResolvedValueOnce(
      fakeCompletion(JSON.stringify({ foo: "bar" })),
    );

    const result = await generateDocumentSummary(
      "A".repeat(100),
      "test.pdf",
      "application/pdf",
    );

    expect(result).toBeNull();
  });

  it("returns null when OpenAI call throws", async () => {
    mockCompletionCreate.mockRejectedValueOnce(new Error("Rate limited"));

    const result = await generateDocumentSummary(
      "A".repeat(100),
      "test.pdf",
      "application/pdf",
    );

    expect(result).toBeNull();
  });

  it("normalises entity arrays even if LLM returns non-arrays", async () => {
    const llmResponse = {
      summary: "A document about something.",
      entities: {
        clients: "Single Client", // string instead of array
        amounts: null,
        dates: ["2024-01-01"],
        documentType: "invoice",
      },
    };
    mockCompletionCreate.mockResolvedValueOnce(
      fakeCompletion(JSON.stringify(llmResponse)),
    );

    const result = await generateDocumentSummary(
      "A".repeat(100),
      "test.pdf",
      "application/pdf",
    );

    expect(result).not.toBeNull();
    // Non-array clients should become empty array
    expect(result!.entities.clients).toEqual([]);
    // Null amounts should become empty array
    expect(result!.entities.amounts).toEqual([]);
    expect(result!.entities.dates).toEqual(["2024-01-01"]);
  });

  it("truncates text to MAX_TEXT_FOR_SUMMARY", async () => {
    const longText = "X".repeat(50_000);
    const llmResponse = {
      summary: "Summary of long doc.",
      entities: { clients: [], amounts: [], dates: [] },
    };
    mockCompletionCreate.mockResolvedValueOnce(
      fakeCompletion(JSON.stringify(llmResponse)),
    );

    await generateDocumentSummary(longText, "big.pdf", "application/pdf");

    const [call] = mockCompletionCreate.mock.calls;
    const opts = call[0] as { messages: { role: string; content: string }[] };
    // User message should be truncated, not the full 50k
    expect(opts.messages[1].content.length).toBeLessThan(30_000);
  });
});

// ─── rebuildFirmSnapshot ─────────────────────────────────────────

describe("rebuildFirmSnapshot", () => {
  beforeEach(() => {
    mockDocFindMany.mockReset();
    mockFirmUpdate.mockReset();
  });

  it("returns null when no documents with summaries exist", async () => {
    mockDocFindMany.mockResolvedValueOnce([]);

    const result = await rebuildFirmSnapshot(FIRM_ID);

    expect(result).toBeNull();
    expect(mockFirmUpdate).not.toHaveBeenCalled();
  });

  it("builds snapshot from document summaries and updates firm", async () => {
    mockDocFindMany.mockResolvedValueOnce([
      {
        filename: "gst_q3.pdf",
        source: "gmail",
        sourceDate: new Date("2024-03-15"),
        summary: "GST return for Mehta Traders Q3.",
        entities: {
          clients: ["Mehta Traders"],
          amounts: ["₹45,000"],
          dates: ["Q3 FY 2023-24"],
          documentType: "gst-return",
          gstNumbers: ["27AABCU9603R1ZM"],
          panNumbers: [],
        },
        mimeType: "application/pdf",
      },
      {
        filename: "balance_sheet.xlsx",
        source: "drive",
        sourceDate: new Date("2024-01-10"),
        summary: "Balance sheet for Kumar & Co.",
        entities: {
          clients: ["Kumar & Co."],
          amounts: ["₹12,00,000"],
          dates: ["FY 2023-24"],
          documentType: "balance-sheet",
          gstNumbers: [],
          panNumbers: ["ABCDE1234F"],
        },
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ]);
    mockFirmUpdate.mockResolvedValueOnce({});

    const result = await rebuildFirmSnapshot(FIRM_ID);

    expect(result).not.toBeNull();
    expect(result).toContain("2 documents indexed");
    expect(result).toContain("Mehta Traders");
    expect(result).toContain("Kumar & Co.");
    expect(result).toContain("gst-return");
    expect(result).toContain("balance-sheet");
    expect(result).toContain("27AABCU9603R1ZM");
    expect(result).toContain("ABCDE1234F");

    // Verify firm was updated with the snapshot
    expect(mockFirmUpdate).toHaveBeenCalledWith({
      where: { id: FIRM_ID },
      data: { knowledgeSnapshot: result },
    });
  });

  it("aggregates entities from multiple documents", async () => {
    mockDocFindMany.mockResolvedValueOnce([
      {
        filename: "doc1.pdf",
        source: "gmail",
        sourceDate: new Date("2024-03-15"),
        summary: "Doc 1 summary.",
        entities: {
          clients: ["Client A", "Client B"],
          amounts: [],
          dates: [],
          documentType: "invoice",
          gstNumbers: ["GST1"],
          panNumbers: [],
        },
        mimeType: "application/pdf",
      },
      {
        filename: "doc2.pdf",
        source: "gmail",
        sourceDate: new Date("2024-02-01"),
        summary: "Doc 2 summary.",
        entities: {
          clients: ["Client B", "Client C"],
          amounts: [],
          dates: [],
          documentType: "invoice",
          gstNumbers: ["GST2"],
          panNumbers: ["PAN1"],
        },
        mimeType: "application/pdf",
      },
    ]);
    mockFirmUpdate.mockResolvedValueOnce({});

    const result = await rebuildFirmSnapshot(FIRM_ID);

    expect(result).toContain("Client A");
    expect(result).toContain("Client B");
    expect(result).toContain("Client C");
    expect(result).toContain("GST1");
    expect(result).toContain("GST2");
    expect(result).toContain("PAN1");
    expect(result).toContain("invoice (2)");
  });

  it("shows date range from oldest to newest document", async () => {
    mockDocFindMany.mockResolvedValueOnce([
      {
        filename: "new.pdf",
        source: "gmail",
        sourceDate: new Date("2024-06-15"),
        summary: "Newer doc.",
        entities: { documentType: "other" },
        mimeType: "application/pdf",
      },
      {
        filename: "old.pdf",
        source: "drive",
        sourceDate: new Date("2023-01-01"),
        summary: "Older doc.",
        entities: { documentType: "other" },
        mimeType: "application/pdf",
      },
    ]);
    mockFirmUpdate.mockResolvedValueOnce({});

    const result = await rebuildFirmSnapshot(FIRM_ID);

    expect(result).toContain("2023-01-01");
    expect(result).toContain("2024-06-15");
  });
});
