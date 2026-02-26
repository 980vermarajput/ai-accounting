/**
 * Document Summariser & Firm Knowledge Snapshot generator.
 *
 * Two main exports:
 *   - `generateDocumentSummary` — LLM-based summary + entity extraction for a
 *     single document (called once during extraction pipeline).
 *   - `rebuildFirmSnapshot` — Aggregate all document summaries for a firm into
 *     a concise knowledge snapshot injected into every RAG system prompt.
 *
 * Design notes:
 *   - Uses GPT-4o-mini with JSON response format for structured output.
 *   - Document summary is 2–3 sentences (~80 tokens); entities capture
 *     clients, amounts, dates, GST/PAN numbers, and document type.
 *   - Firm snapshot is a structured overview of all indexed documents —
 *     typically 200–500 tokens.  Stored in `firms.knowledge_snapshot`.
 *   - The OpenAI client is lazily instantiated, same pattern as `rag.ts`.
 */

import OpenAI from "openai";
import { prisma } from "./prisma";

// ─── Constants ───────────────────────────────────────────────────

/** LLM model for summarisation (cheap, fast). */
const SUMMARY_MODEL = "gpt-4o-mini";

/** Max text length sent to the LLM — roughly 6 000 tokens. */
const MAX_TEXT_FOR_SUMMARY = 24_000;

// ─── Public types ────────────────────────────────────────────────

export interface DocumentSummaryResult {
  summary: string;
  entities: {
    clients: string[];
    amounts: string[];
    dates: string[];
    documentType?: string;
    gstNumbers?: string[];
    panNumbers?: string[];
  };
}

// ─── Lazy OpenAI client ──────────────────────────────────────────

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
      throw new Error("OPENAI_API_KEY environment variable is not set.");
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

// ─── generateDocumentSummary ─────────────────────────────────────

/**
 * Generate a 2–3 sentence summary and extract key entities from extracted
 * document text.  Called once per document during the extraction pipeline.
 *
 * @param text      - Plain text extracted from the document.
 * @param filename  - Original filename (gives the LLM context clues).
 * @param mimeType  - MIME type of the source file.
 * @returns         - `{ summary, entities }` or `null` on failure.
 */
export async function generateDocumentSummary(
  text: string,
  filename: string,
  mimeType: string,
): Promise<DocumentSummaryResult | null> {
  if (!text || text.trim().length < 50) return null;

  const client = getClient();
  const truncated = text.slice(0, MAX_TEXT_FOR_SUMMARY);

  try {
    const completion = await client.chat.completions.create({
      model: SUMMARY_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 512,
      messages: [
        {
          role: "system",
          content: `You are a document analysis assistant for Indian chartered accountants (CAs).
Given a document's text content, produce a JSON summary with these exact fields:
{
  "summary": "<2-3 sentence summary of what this document is about, who it relates to, key figures>",
  "entities": {
    "clients": ["<list of person/company names mentioned>"],
    "amounts": ["<key monetary amounts with context, e.g. 'Total GST: ₹45,000'>"],
    "dates": ["<important dates, e.g. 'FY 2023-24', 'Due: 15 Mar 2024'>"],
    "documentType": "<one of: invoice, gst-return, itr, balance-sheet, ledger, bank-statement, salary-register, purchase-register, trial-balance, brs, correspondence, receipt, tds-certificate, other>",
    "gstNumbers": ["<any GSTIN numbers found, e.g. '27AABCU9603R1ZM'>"],
    "panNumbers": ["<any PAN numbers found, e.g. 'ABCDE1234F'>"]
  }
}
Be concise. Focus on facts in the document.  If a field has no data, return an empty array.`,
        },
        {
          role: "user",
          content: `Filename: ${filename}\nMIME type: ${mimeType}\n\nDocument text:\n${truncated}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as DocumentSummaryResult;

    // Validate minimal structure
    if (typeof parsed.summary !== "string" || !parsed.entities) {
      console.warn(
        `[Summarizer] Unexpected LLM response structure for "${filename}"`,
      );
      return null;
    }

    // Normalise entity arrays (ensure they're arrays even if LLM returns something odd)
    const entities = {
      clients: Array.isArray(parsed.entities.clients)
        ? parsed.entities.clients.map(String)
        : [],
      amounts: Array.isArray(parsed.entities.amounts)
        ? parsed.entities.amounts.map(String)
        : [],
      dates: Array.isArray(parsed.entities.dates)
        ? parsed.entities.dates.map(String)
        : [],
      documentType:
        typeof parsed.entities.documentType === "string"
          ? parsed.entities.documentType
          : undefined,
      gstNumbers: Array.isArray(parsed.entities.gstNumbers)
        ? parsed.entities.gstNumbers.map(String)
        : [],
      panNumbers: Array.isArray(parsed.entities.panNumbers)
        ? parsed.entities.panNumbers.map(String)
        : [],
    };

    return { summary: parsed.summary.trim(), entities };
  } catch (err) {
    console.error(
      `[Summarizer] Failed to summarise "${filename}":`,
      err instanceof Error ? err.message : err,
    );
    return null; // non-fatal — document continues without summary
  }
}

// ─── rebuildFirmSnapshot ─────────────────────────────────────────

/**
 * Rebuild the firm-level knowledge snapshot from all ready documents that
 * have summaries.  The snapshot is a concise structured overview stored in
 * `firms.knowledge_snapshot` and injected into every RAG system prompt so
 * the LLM knows what documents exist before any chunk retrieval happens.
 *
 * @param firmId - UUID of the firm.
 * @returns The generated snapshot text, or `null` if no summaries exist.
 */
export async function rebuildFirmSnapshot(
  firmId: string,
): Promise<string | null> {
  // Fetch all ready documents with summaries for this firm
  const documents = await prisma.document.findMany({
    where: {
      firmId,
      status: "ready",
      summary: { not: null },
    },
    select: {
      filename: true,
      source: true,
      sourceDate: true,
      summary: true,
      entities: true,
      mimeType: true,
    },
    orderBy: { sourceDate: "desc" },
  });

  if (documents.length === 0) return null;

  // Build a structured snapshot without calling LLM (deterministic + free)
  const docTypeMap = new Map<string, number>();
  const allClients = new Set<string>();
  const allGstNumbers = new Set<string>();
  const allPanNumbers = new Set<string>();
  let oldestDate: Date | null = null;
  let newestDate: Date | null = null;

  const docSummaries: string[] = [];

  for (const doc of documents) {
    const entities = doc.entities as DocumentSummaryResult["entities"] | null;
    const dateStr = doc.sourceDate.toISOString().split("T")[0];

    // Aggregate doc types
    const docType = entities?.documentType ?? "other";
    docTypeMap.set(docType, (docTypeMap.get(docType) ?? 0) + 1);

    // Aggregate entities
    if (entities?.clients) entities.clients.forEach((c) => allClients.add(c));
    if (entities?.gstNumbers)
      entities.gstNumbers.forEach((g) => allGstNumbers.add(g));
    if (entities?.panNumbers)
      entities.panNumbers.forEach((p) => allPanNumbers.add(p));

    // Track date range
    if (!oldestDate || doc.sourceDate < oldestDate) oldestDate = doc.sourceDate;
    if (!newestDate || doc.sourceDate > newestDate) newestDate = doc.sourceDate;

    // Build per-doc line
    const sourceLabel =
      doc.source === "gmail"
        ? "Gmail"
        : doc.source === "drive"
          ? "Drive"
          : "Upload";
    docSummaries.push(
      `- [${dateStr}] ${doc.filename} (${sourceLabel}): ${doc.summary}`,
    );
  }

  // Assemble the snapshot
  const lines: string[] = [];
  lines.push(`FIRM KNOWLEDGE SNAPSHOT (${documents.length} documents indexed)`);
  lines.push("");

  // Date range
  if (oldestDate && newestDate) {
    lines.push(
      `Date range: ${oldestDate.toISOString().split("T")[0]} to ${newestDate.toISOString().split("T")[0]}`,
    );
  }

  // Document types
  const typeEntries = [...docTypeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type} (${count})`)
    .join(", ");
  lines.push(`Document types: ${typeEntries}`);

  // Clients
  if (allClients.size > 0) {
    lines.push(`Clients/entities: ${[...allClients].join(", ")}`);
  }

  // GST/PAN
  if (allGstNumbers.size > 0) {
    lines.push(`GST numbers: ${[...allGstNumbers].join(", ")}`);
  }
  if (allPanNumbers.size > 0) {
    lines.push(`PAN numbers: ${[...allPanNumbers].join(", ")}`);
  }

  lines.push("");
  lines.push("Document index:");
  lines.push(...docSummaries);

  const snapshot = lines.join("\n");

  // Persist to firm
  await prisma.firm.update({
    where: { id: firmId },
    data: { knowledgeSnapshot: snapshot },
  });

  console.log(
    `[Snapshot] Rebuilt firm snapshot for ${firmId}: ${documents.length} docs, ${snapshot.length} chars`,
  );

  return snapshot;
}
