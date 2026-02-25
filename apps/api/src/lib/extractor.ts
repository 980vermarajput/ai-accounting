/**
 * Text extraction from binary document buffers.
 *
 * Supported formats:
 *   - PDF            → pdf-parse
 *   - DOCX / DOC     → mammoth
 *   - XLSX / XLS     → xlsx (each sheet converted to CSV)
 *   - text/*         → UTF-8 decode
 *
 * Returns the normalized plain text plus a SHA-256 hex digest of that text
 * for deduplication.
 */

import crypto from "crypto";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

// ─── Public types ────────────────────────────────────────────────

export interface ExtractResult {
  /** Normalized plain text extracted from the document. */
  text: string;
  /** SHA-256 hex digest of the normalized text (64 chars). */
  textHash: string;
}

// ─── Main function ───────────────────────────────────────────────

/**
 * Extract plain text from a binary buffer.
 *
 * @param buffer   - Raw file content as a Node.js `Buffer`
 * @param mimeType - MIME type of the document (e.g. `"application/pdf"`)
 * @returns        - `{ text, textHash }`
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractResult> {
  let raw = "";

  if (mimeType === "application/pdf") {
    // ── PDF ──────────────────────────────────────────────────────
    // pdf-parse v2 uses a class-based API: new PDFParse({ data }) → .getText()
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    raw = result.text;
  } else if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    // ── DOCX / DOC ───────────────────────────────────────────────
    // mammoth throws on corrupted / non-OOXML files — treat as empty text
    try {
      const result = await mammoth.extractRawText({ buffer });
      raw = result.value;
    } catch {
      raw = "";
    }
  } else if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "text/csv"
  ) {
    // ── XLSX / XLS / CSV ─────────────────────────────────────────
    // Each sheet is serialised as CSV; sheets are joined with double newline
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheets: string[] = [];
    for (const name of workbook.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
      if (csv.trim()) {
        sheets.push(`[${name}]\n${csv}`);
      }
    }
    raw = sheets.join("\n\n");
  } else if (mimeType.startsWith("text/")) {
    // ── Plain text / HTML / Markdown / etc. ──────────────────────
    raw = buffer.toString("utf-8");
  }
  // else: unsupported binary format — text stays empty

  // Normalize: Windows newlines → Unix, collapse horizontal whitespace runs
  const text = raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  const textHash = crypto
    .createHash("sha256")
    .update(text || "<empty>")
    .digest("hex");

  return { text, textHash };
}
