/**
 * Unit tests for deadline-extractor.ts
 *
 * Strategy:
 *  - Tests regex date matching (findDateMatches) directly
 *  - Tests compliance keyword filtering (filterByComplianceKeywords)
 *  - Tests full extractDeadlinesFromDocument with mocked prisma + OpenAI
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Prisma ────────────────────────────────────────────────

vi.mock("./prisma", () => ({
  prisma: {
    document: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    chunk: {
      findMany: vi.fn(),
    },
    alert: {
      create: vi.fn(),
    },
    extractedDeadline: {
      create: vi.fn(),
    },
  },
}));

// ─── Mock Logger ────────────────────────────────────────────────

vi.mock("./logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Mock OpenAI ────────────────────────────────────────────────

const mockCreate = vi.fn();

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

// ─── Imports ────────────────────────────────────────────────────

import { prisma } from "./prisma";
import {
  findDateMatches,
  filterByComplianceKeywords,
  extractDeadlinesFromDocument,
} from "./deadline-extractor";

const FIRM_ID = "firm-001";
const DOC_ID = "doc-001";

describe("deadline-extractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
  });

  // ── findDateMatches ─────────────────────────────────────────

  describe("findDateMatches", () => {
    it("finds DD/MM/YYYY date patterns", () => {
      const text = "The deadline is 15/03/2025 for GST filing";
      const matches = findDateMatches(text);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].dateStr).toBe("15/03/2025");
    });

    it("finds DD-MM-YYYY date patterns", () => {
      const text = "Submit before 31-03-2025 for TDS return";
      const matches = findDateMatches(text);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches.some((m) => m.dateStr === "31-03-2025")).toBe(true);
    });

    it("finds ISO YYYY-MM-DD date patterns", () => {
      const text = "Due date: 2025-04-15 for advance tax payment";
      const matches = findDateMatches(text);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches.some((m) => m.dateStr === "2025-04-15")).toBe(true);
    });

    it("finds month name patterns like '15 January 2025'", () => {
      const text = "The audit must be completed by 15 January 2025";
      const matches = findDateMatches(text);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts context window around each match", () => {
      const text =
        "A".repeat(150) + " deadline is 15/03/2025 for filing " + "B".repeat(150);
      const matches = findDateMatches(text);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      // Context should be roughly 100 chars before + match + 100 chars after
      expect(matches[0].context.length).toBeLessThan(text.length);
      expect(matches[0].context).toContain("15/03/2025");
    });

    it("returns empty array for text with no dates", () => {
      const text = "This document contains no dates at all";
      const matches = findDateMatches(text);
      expect(matches).toEqual([]);
    });

    it("deduplicates overlapping date matches", () => {
      const text = "Due by 15/03/2025 for compliance deadline";
      const matches = findDateMatches(text);
      // Should not have duplicate for the same position
      const uniqueIndices = new Set(matches.map((m) => m.index));
      expect(uniqueIndices.size).toBe(matches.length);
    });
  });

  // ── filterByComplianceKeywords ──────────────────────────────

  describe("filterByComplianceKeywords", () => {
    it("keeps matches with compliance keywords in context", () => {
      const matches = [
        { dateStr: "15/03/2025", context: "GST filing due on 15/03/2025", index: 0 },
        { dateStr: "01/01/2025", context: "Happy new year 01/01/2025", index: 100 },
      ];
      const filtered = filterByComplianceKeywords(matches);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].dateStr).toBe("15/03/2025");
    });

    it("returns empty when no compliance keywords present", () => {
      const matches = [
        { dateStr: "01/01/2025", context: "Birthday party on 01/01/2025", index: 0 },
      ];
      const filtered = filterByComplianceKeywords(matches);
      expect(filtered).toHaveLength(0);
    });

    it("is case-insensitive for keyword matching", () => {
      const matches = [
        {
          dateStr: "15/03/2025",
          context: "GSTR-3B FILING deadline 15/03/2025",
          index: 0,
        },
      ];
      const filtered = filterByComplianceKeywords(matches);
      expect(filtered).toHaveLength(1);
    });

    it("matches multiple compliance keywords", () => {
      const matches = [
        {
          dateStr: "15/06/2025",
          context: "ITR filing deadline 15/06/2025 penalty",
          index: 0,
        },
        { dateStr: "20/07/2025", context: "TDS return due 20/07/2025", index: 100 },
      ];
      const filtered = filterByComplianceKeywords(matches);
      expect(filtered).toHaveLength(2);
    });
  });

  // ── extractDeadlinesFromDocument ────────────────────────────

  describe("extractDeadlinesFromDocument", () => {
    it("skips if document not found", async () => {
      vi.mocked(prisma.document.findUnique).mockResolvedValue(null);

      const result = await extractDeadlinesFromDocument(DOC_ID);
      expect(result).toEqual([]);
    });

    it("skips if document already has deadline_extracted = true", async () => {
      vi.mocked(prisma.document.findUnique).mockResolvedValue({
        id: DOC_ID,
        firmId: FIRM_ID,
        clientId: null,
        filename: "test.pdf",
        deadlineExtracted: true,
        createdAt: new Date(),
      } as any);

      const result = await extractDeadlinesFromDocument(DOC_ID);
      expect(result).toEqual([]);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it("skips if document is older than 48 hours", async () => {
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 49);

      vi.mocked(prisma.document.findUnique).mockResolvedValue({
        id: DOC_ID,
        firmId: FIRM_ID,
        clientId: null,
        filename: "test.pdf",
        deadlineExtracted: false,
        createdAt: oldDate,
      } as any);

      const result = await extractDeadlinesFromDocument(DOC_ID);
      expect(result).toEqual([]);
      // Should mark as extracted
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deadlineExtracted: true,
            deadlineCount: 0,
          }),
        }),
      );
    });

    it("marks as extracted with count 0 when no chunks exist", async () => {
      vi.mocked(prisma.document.findUnique).mockResolvedValue({
        id: DOC_ID,
        firmId: FIRM_ID,
        clientId: null,
        filename: "test.pdf",
        deadlineExtracted: false,
        createdAt: new Date(),
      } as any);
      vi.mocked(prisma.chunk.findMany).mockResolvedValue([]);

      const result = await extractDeadlinesFromDocument(DOC_ID);
      expect(result).toEqual([]);
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deadlineExtracted: true,
            deadlineCount: 0,
          }),
        }),
      );
    });

    it("marks as extracted with count 0 when no date patterns found", async () => {
      vi.mocked(prisma.document.findUnique).mockResolvedValue({
        id: DOC_ID,
        firmId: FIRM_ID,
        clientId: null,
        filename: "test.pdf",
        deadlineExtracted: false,
        createdAt: new Date(),
      } as any);
      vi.mocked(prisma.chunk.findMany).mockResolvedValue([
        { chunkText: "This document has no dates in it whatsoever" },
      ] as any);

      const result = await extractDeadlinesFromDocument(DOC_ID);
      expect(result).toEqual([]);
    });

    it("creates deadline + alert when LLM finds valid deadline", async () => {
      vi.mocked(prisma.document.findUnique).mockResolvedValue({
        id: DOC_ID,
        firmId: FIRM_ID,
        clientId: "client-001",
        filename: "gst-notice.pdf",
        deadlineExtracted: false,
        createdAt: new Date(),
      } as any);

      vi.mocked(prisma.chunk.findMany).mockResolvedValue([
        {
          chunkText:
            "Please note the GST filing deadline is 15/03/2025. Failure to comply will result in penalties.",
        },
      ] as any);

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                deadlines: [
                  {
                    date: "2025-03-15",
                    description: "GST filing deadline",
                    confidence: "HIGH",
                  },
                ],
              }),
            },
          },
        ],
      });

      vi.mocked(prisma.alert.create).mockResolvedValue({
        id: "alert-1",
      } as any);
      vi.mocked(prisma.extractedDeadline.create).mockResolvedValue({
        id: "dl-1",
      } as any);

      const result = await extractDeadlinesFromDocument(DOC_ID);

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe("GST filing deadline");
      expect(result[0].confidence).toBe("HIGH");

      // Should create alert
      expect(prisma.alert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firmId: FIRM_ID,
            type: "DEADLINE_DETECTED",
            title: "Deadline: GST filing deadline",
          }),
        }),
      );

      // Should persist deadline
      expect(prisma.extractedDeadline.create).toHaveBeenCalled();

      // Should update document flags
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deadlineExtracted: true,
            deadlineCount: 1,
          }),
        }),
      );
    });

    it("marks as extracted with 0 when dates found but no compliance keywords", async () => {
      vi.mocked(prisma.document.findUnique).mockResolvedValue({
        id: DOC_ID,
        firmId: FIRM_ID,
        clientId: null,
        filename: "birthday-invite.pdf",
        deadlineExtracted: false,
        createdAt: new Date(),
      } as any);

      vi.mocked(prisma.chunk.findMany).mockResolvedValue([
        {
          chunkText:
            "The party is on 15/03/2025 at the office. Please RSVP by 10/03/2025.",
        },
      ] as any);

      const result = await extractDeadlinesFromDocument(DOC_ID);
      expect(result).toEqual([]);
    });
  });
});
