import { describe, it, expect } from "vitest";
import { chunkText } from "./chunker";

// ─── chunkText ───────────────────────────────────────────────────────────────

describe("chunkText", () => {
  // ── Edge cases ────────────────────────────────────────────────

  it("returns empty array for empty string", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  it("returns a single chunk for short text", () => {
    const text = "This is a short document. It has two sentences.";
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].chunkText).toContain("short document");
  });

  it("assigns sequential chunkIndex values starting at 0", () => {
    // Generate enough text to force multiple chunks (~5 000 chars → ~4 chunks)
    const sentence =
      "This is a test sentence that contains typical CA document content. ";
    const text = sentence.repeat(100);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });

  it("every chunk has a positive tokenCount", () => {
    const sentence =
      "Revenue from operations grew by twelve percent year on year. ";
    const text = sentence.repeat(60);
    const chunks = chunkText(text);
    for (const c of chunks) {
      expect(c.tokenCount).toBeGreaterThan(0);
    }
  });

  it("no chunk exceeds the 1 200-token hard cap", () => {
    const sentence =
      "The assessee filed returns under section 44ADA of the Income Tax Act. ";
    const text = sentence.repeat(100);
    const chunks = chunkText(text);
    for (const c of chunks) {
      // tokenCount approximation is chars/4 so cap is 1200 tokens = 4800 chars
      expect(c.tokenCount).toBeLessThanOrEqual(1200);
    }
  });

  // ── Overlap ───────────────────────────────────────────────────

  it("consecutive chunks share overlapping text when there is enough content", () => {
    // Build a ~6 000-char text so we get at least 3 chunks
    const sentence =
      "Goods and Services Tax returns must be filed before the due date each month. ";
    const text = sentence.repeat(100);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // The end of chunk[0] should appear somewhere at the beginning of chunk[1]
    const lastWordOfFirst = chunks[0].chunkText
      .trim()
      .split(/\s+/)
      .slice(-5)
      .join(" ");
    expect(chunks[1].chunkText).toContain(lastWordOfFirst);
  });

  it("overlap does not create an infinite loop when text is exactly at boundary", () => {
    // A single very long sentence should still produce finite output
    const longSentence = "word ".repeat(400); // ~400 tokens ≈ 1600 chars, no punctuation
    const chunks = chunkText(longSentence);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  // ── Content integrity ─────────────────────────────────────────

  it("chunk text is never empty", () => {
    const sentence =
      "TDS deductions under section 194C apply to contractor payments. ";
    const text = sentence.repeat(50);
    const chunks = chunkText(text);
    for (const c of chunks) {
      expect(c.chunkText.trim().length).toBeGreaterThan(0);
    }
  });

  it("joins all chunks to approximately reproduce the original text", () => {
    const original =
      "This is the first sentence. This is the second sentence. This is the third one.";
    const chunks = chunkText(original);
    // Because of overlap chunks may repeat content, but every word in the
    // original should appear in at least one chunk
    const combined = chunks.map((c) => c.chunkText).join(" ");
    const words = original.split(/\s+/);
    for (const word of words) {
      expect(combined).toContain(word.replace(/[.,]/g, ""));
    }
  });

  // ── Single-chunk text ─────────────────────────────────────────

  it("returns exactly one chunk when text fits within target tokens", () => {
    // 200 chars ≈ 50 tokens — well within the 900-token target
    const text =
      "A brief audit report for FY 2024-25. Total income declared: ₹42,00,000.";
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkText).toBe(text);
  });
});
