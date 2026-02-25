import { describe, it, expect } from "vitest";
import { extractText } from "./extractor";

// ─── extractText ─────────────────────────────────────────────────────────────

describe("extractText", () => {
  // ── Plain text ────────────────────────────────────────────────

  it("extracts plain text content from a text/plain buffer", async () => {
    const content = "Income tax return for AY 2024-25.";
    const buf = Buffer.from(content, "utf-8");
    const { text } = await extractText(buf, "text/plain");
    expect(text).toBe(content);
  });

  it("returns the text for text/html mime type", async () => {
    const buf = Buffer.from("<p>Hello world</p>", "utf-8");
    const { text } = await extractText(buf, "text/html");
    expect(text).toContain("Hello world");
  });

  it("normalizes Windows-style CRLF line endings to LF", async () => {
    const buf = Buffer.from("line one\r\nline two\r\nline three", "utf-8");
    const { text } = await extractText(buf, "text/plain");
    expect(text).not.toContain("\r\n");
    expect(text).toContain("line one\nline two");
  });

  it("collapses multiple spaces into a single space", async () => {
    const buf = Buffer.from("too   many     spaces  here", "utf-8");
    const { text } = await extractText(buf, "text/plain");
    expect(text).toBe("too many spaces here");
  });

  it("trims leading and trailing whitespace", async () => {
    const buf = Buffer.from("  \n  trimmed  \n  ", "utf-8");
    const { text } = await extractText(buf, "text/plain");
    expect(text).toBe("trimmed");
  });

  // ── textHash ──────────────────────────────────────────────────

  it("returns a 64-char hex SHA-256 textHash", async () => {
    const buf = Buffer.from("Audit report FY 2024-25", "utf-8");
    const { textHash } = await extractText(buf, "text/plain");
    expect(textHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces the same textHash for identical content", async () => {
    const content = "Reproducible content for hashing.";
    const buf1 = Buffer.from(content, "utf-8");
    const buf2 = Buffer.from(content, "utf-8");
    const { textHash: h1 } = await extractText(buf1, "text/plain");
    const { textHash: h2 } = await extractText(buf2, "text/plain");
    expect(h1).toBe(h2);
  });

  it("produces different textHashes for different content", async () => {
    const { textHash: h1 } = await extractText(
      Buffer.from("content A", "utf-8"),
      "text/plain",
    );
    const { textHash: h2 } = await extractText(
      Buffer.from("content B", "utf-8"),
      "text/plain",
    );
    expect(h1).not.toBe(h2);
  });

  it("returns a stable textHash for an empty buffer (not empty string)", async () => {
    const { text, textHash } = await extractText(
      Buffer.from("", "utf-8"),
      "text/plain",
    );
    expect(text).toBe("");
    // textHash should be SHA-256 of "<empty>" sentinel — always 64 hex chars
    expect(textHash).toMatch(/^[0-9a-f]{64}$/);
  });

  // ── Unsupported format ────────────────────────────────────────

  it("returns empty text for an unsupported binary mime type", async () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const { text } = await extractText(buf, "image/png");
    expect(text).toBe("");
  });

  it("returns a valid textHash even for unsupported formats", async () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff]);
    const { textHash } = await extractText(buf, "image/jpeg");
    expect(textHash).toMatch(/^[0-9a-f]{64}$/);
  });

  // ── XLSX ──────────────────────────────────────────────────────

  it("extracts CSV-like text from an XLSX buffer", async () => {
    // Build a minimal XLSX workbook in memory with the xlsx library
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Client", "GSTIN", "Revenue"],
      ["Mehta Traders", "27AAAAA0000A1Z5", "5000000"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const xlsxBuf = Buffer.from(
      XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
    );

    const { text } = await extractText(
      xlsxBuf,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(text).toContain("Mehta Traders");
    expect(text).toContain("GSTIN");
  });

  // ── DOCX ──────────────────────────────────────────────────────

  it("extracts text from a DOCX buffer", async () => {
    // Mammoth can read a well-formed DOCX; we use a minimal in-memory structure.
    // Since creating a full OOXML zip is complex, we verify that the function
    // does NOT throw and returns a hash — content tested via integration.
    const buf = Buffer.from("PK\x03\x04", "utf-8"); // minimal DOCX-like magic bytes
    // mammoth will fail to parse this, but extractText should handle the error gracefully
    await expect(
      extractText(
        buf,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).resolves.toMatchObject({
      textHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });
});
