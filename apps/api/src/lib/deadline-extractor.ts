/**
 * Deadline Extractor Service — scans document text for compliance deadlines.
 *
 * Detection pipeline:
 *   1. Regex pass: find date patterns (DD/MM/YYYY, DD-MM-YYYY, "by [date]", etc.)
 *   2. Context window: extract 100 chars before + after each date match
 *   3. Keyword filter: only flag if context contains compliance keywords
 *   4. GPT-4o-mini structured extraction: date, description, confidence
 *   5. Create DEADLINE_DETECTED alerts for each extracted deadline
 *
 * Cost control:
 *   - Only processes documents created in last 48 hours
 *   - Skips if document already has `deadline_extracted` flag
 *   - Max 5 deadlines per document
 *   - Max 500 tokens per LLM call
 */

import OpenAI from "openai";
import { prisma } from "./prisma";
import { logger } from "./logger";

// ─── Types ───────────────────────────────────────────

export interface ExtractedDeadlineResult {
  date: Date;
  description: string;
  clientId?: string;
  rawText: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

interface DateMatch {
  dateStr: string;
  context: string;
  index: number;
}

interface LlmDeadline {
  date: string; // ISO date YYYY-MM-DD
  description: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

// ─── Constants ───────────────────────────────────────

const DEADLINE_MODEL = "gpt-4o-mini";
const MAX_DEADLINES_PER_DOC = 5;
const MAX_TOKENS = 500;
const CONTEXT_WINDOW = 100; // chars before and after date match
const STALENESS_HOURS = 48;

/** Compliance keywords — at least one must appear near a date. */
const COMPLIANCE_KEYWORDS = [
  "gst",
  "tds",
  "itr",
  "audit",
  "roc",
  "filing",
  "return",
  "advance tax",
  "due date",
  "deadline",
  "last date",
  "penalty",
  "gstr",
  "form 16",
  "form 26as",
  "mca",
  "agm",
  "board meeting",
  "compliance",
  "assessment",
  "income tax",
  "quarterly",
  "annual",
  "submission",
];

/**
 * Date regex patterns:
 *   DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 *   "by [date]", "before [date]", "due [date]", "deadline [date]", "last date [date]"
 *   Month name patterns: "15 January 2025", "January 15, 2025"
 */
const DATE_PATTERNS = [
  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/gi,
  // YYYY-MM-DD (ISO)
  /\b(\d{4})-(\d{2})-(\d{2})\b/g,
  // "15 January 2025" / "15th January 2025"
  /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi,
  // "January 15, 2025"
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi,
  // "by/before/due/deadline/last date" followed by a date-like token
  /\b(?:by|before|due|deadline|last\s+date)\s*[:\s]\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/gi,
];

// ─── Lazy OpenAI client ──────────────────────────────

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is not set.");
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

// ─── Regex date extraction ───────────────────────────

/**
 * Find all date-like patterns in the text and extract context windows around them.
 */
export function findDateMatches(text: string): DateMatch[] {
  const matches: DateMatch[] = [];
  const seenIndices = new Set<number>();

  for (const pattern of DATE_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const idx = match.index;
      // Dedup overlapping matches — skip if within 5 chars of an existing match
      const tooClose = [...seenIndices].some((si) => Math.abs(si - idx) < 5);
      if (tooClose) continue;

      seenIndices.add(idx);
      const start = Math.max(0, idx - CONTEXT_WINDOW);
      const end = Math.min(text.length, idx + match[0].length + CONTEXT_WINDOW);
      matches.push({
        dateStr: match[0],
        context: text.slice(start, end),
        index: idx,
      });
    }
  }

  return matches;
}

/**
 * Filter date matches: only keep those whose context contains a compliance keyword.
 */
export function filterByComplianceKeywords(matches: DateMatch[]): DateMatch[] {
  return matches.filter((m) => {
    const ctx = m.context.toLowerCase();
    return COMPLIANCE_KEYWORDS.some((kw) => ctx.includes(kw));
  });
}

// ─── LLM structured extraction ──────────────────────

/**
 * Call GPT-4o-mini to extract structured deadline info from context windows.
 */
async function extractWithLlm(
  contexts: string[],
  documentFilename: string,
): Promise<LlmDeadline[]> {
  if (contexts.length === 0) return [];

  const client = getClient();

  const systemPrompt = `You are an Indian chartered accountant's compliance assistant.
Extract compliance deadlines from the given text contexts. Each context contains
a date and surrounding text from a financial/accounting document.

For each valid compliance deadline found, return:
- date: the deadline date in ISO format (YYYY-MM-DD)
- description: a concise description of what is due (e.g. "GSTR-3B filing due")
- confidence: HIGH if the date is clearly a compliance deadline, MEDIUM if likely, LOW if uncertain

Rules:
- Only extract dates that represent compliance/regulatory deadlines
- Ignore dates that are document creation dates, invoice dates, or payment received dates
- Return at most ${MAX_DEADLINES_PER_DOC} deadlines
- If no valid deadlines found, return an empty array

Return JSON: { "deadlines": [...] }`;

  const userPrompt = `Document: "${documentFilename}"

Contexts found:
${contexts.map((c, i) => `${i + 1}. "${c}"`).join("\n")}`;

  try {
    const completion = await client.chat.completions.create({
      model: DEADLINE_MODEL,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content) as { deadlines?: LlmDeadline[] };
    if (!Array.isArray(parsed.deadlines)) return [];

    // Validate and filter
    return parsed.deadlines
      .filter(
        (d) =>
          d.date &&
          d.description &&
          /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
          !isNaN(new Date(d.date).getTime()),
      )
      .slice(0, MAX_DEADLINES_PER_DOC);
  } catch (err) {
    logger.error("Deadline LLM extraction failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ─── Main export ─────────────────────────────────────

/**
 * Extract compliance deadlines from a document's chunks.
 *
 * Skips if:
 *   - Document was created > 48 hours ago
 *   - Document already has `deadline_extracted = true`
 *
 * Returns the extracted deadlines (also persists them to DB + creates alerts).
 */
export async function extractDeadlinesFromDocument(
  documentId: string,
): Promise<ExtractedDeadlineResult[]> {
  // 1. Fetch the document
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      firmId: true,
      clientId: true,
      filename: true,
      deadlineExtracted: true,
      createdAt: true,
    },
  });

  if (!doc) {
    logger.warn(`[Deadline] Document ${documentId} not found — skipping`);
    return [];
  }

  // 2. Skip if already extracted
  if (doc.deadlineExtracted) {
    logger.info(`[Deadline] Document ${documentId} already processed — skipping`);
    return [];
  }

  // 3. Skip if document is older than 48 hours
  const ageMs = Date.now() - doc.createdAt.getTime();
  if (ageMs > STALENESS_HOURS * 60 * 60 * 1000) {
    logger.info(
      `[Deadline] Document ${documentId} is ${Math.round(ageMs / 3_600_000)}h old — skipping`,
    );
    // Mark as extracted so we don't re-check
    await prisma.document.update({
      where: { id: documentId },
      data: { deadlineExtracted: true, deadlineCount: 0 },
    });
    return [];
  }

  // 4. Fetch all chunk text for this document
  const chunks = await prisma.chunk.findMany({
    where: { documentId },
    select: { chunkText: true },
    orderBy: { chunkIndex: "asc" },
  });

  if (chunks.length === 0) {
    await prisma.document.update({
      where: { id: documentId },
      data: { deadlineExtracted: true, deadlineCount: 0 },
    });
    return [];
  }

  const fullText = chunks.map((c) => c.chunkText).join("\n\n");

  // 5. Regex pass: find date patterns
  const dateMatches = findDateMatches(fullText);
  if (dateMatches.length === 0) {
    await prisma.document.update({
      where: { id: documentId },
      data: { deadlineExtracted: true, deadlineCount: 0 },
    });
    logger.info(`[Deadline] Document ${documentId}: no date patterns found`);
    return [];
  }

  // 6. Filter by compliance keywords
  const complianceMatches = filterByComplianceKeywords(dateMatches);
  if (complianceMatches.length === 0) {
    await prisma.document.update({
      where: { id: documentId },
      data: { deadlineExtracted: true, deadlineCount: 0 },
    });
    logger.info(
      `[Deadline] Document ${documentId}: ${dateMatches.length} dates found but none with compliance context`,
    );
    return [];
  }

  // 7. LLM structured extraction
  const contexts = complianceMatches.map((m) => m.context);
  const llmDeadlines = await extractWithLlm(contexts, doc.filename);

  if (llmDeadlines.length === 0) {
    await prisma.document.update({
      where: { id: documentId },
      data: { deadlineExtracted: true, deadlineCount: 0 },
    });
    logger.info(`[Deadline] Document ${documentId}: LLM found no valid deadlines`);
    return [];
  }

  // 8. Persist deadlines + create alerts
  const results: ExtractedDeadlineResult[] = [];

  for (const dl of llmDeadlines) {
    try {
      const deadlineDate = new Date(dl.date);
      const rawText =
        complianceMatches.find((m) =>
          m.context.toLowerCase().includes(dl.description.toLowerCase().slice(0, 20)),
        )?.context ?? complianceMatches[0].context;

      // Create an alert for the deadline
      const alert = await prisma.alert.create({
        data: {
          firmId: doc.firmId,
          clientId: doc.clientId,
          type: "DEADLINE_DETECTED",
          severity: determineSeverity(deadlineDate),
          title: `Deadline: ${dl.description}`,
          body: `Compliance deadline detected in "${doc.filename}": ${dl.description} on ${dl.date}`,
          metadata: {
            documentId: doc.id,
            deadlineDate: dl.date,
            confidence: dl.confidence,
          },
          expiresAt: deadlineDate, // alert expires on the deadline date itself
        },
      });

      // Persist the extracted deadline
      await prisma.extractedDeadline.create({
        data: {
          firmId: doc.firmId,
          documentId: doc.id,
          clientId: doc.clientId,
          date: deadlineDate,
          description: dl.description,
          rawText,
          confidence: dl.confidence,
          alertId: alert.id,
        },
      });

      results.push({
        date: deadlineDate,
        description: dl.description,
        clientId: doc.clientId ?? undefined,
        rawText,
        confidence: dl.confidence,
      });
    } catch (err) {
      logger.error(`[Deadline] Failed to persist deadline for doc ${documentId}:`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 9. Update document flags
  await prisma.document.update({
    where: { id: documentId },
    data: {
      deadlineExtracted: true,
      deadlineCount: results.length,
    },
  });

  logger.info(
    `[Deadline] Document ${documentId}: extracted ${results.length} deadline(s)`,
  );

  return results;
}

// ─── Helpers ─────────────────────────────────────────

/**
 * Determine alert severity based on how soon the deadline is.
 *   - Past: CRITICAL
 *   - Within 7 days: HIGH
 *   - Within 30 days: MEDIUM
 *   - Further out: LOW
 */
function determineSeverity(deadlineDate: Date): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  const now = new Date();
  const diffMs = deadlineDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return "CRITICAL";
  if (diffDays <= 7) return "HIGH";
  if (diffDays <= 30) return "MEDIUM";
  return "LOW";
}
