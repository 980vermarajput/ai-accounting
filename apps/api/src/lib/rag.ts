/**
 * RAG (Retrieval-Augmented Generation) service.
 *
 * Two main exports:
 *   - `searchChunks`      — vector similarity search with recency weighting
 *   - `generateRagAnswer` — GPT-4o-mini completion using retrieved context
 *
 * Design notes:
 *   - The OpenAI client is instantiated lazily so tests that only exercise
 *     `searchChunks` don't require OPENAI_API_KEY.
 *   - The LLM always returns JSON (`response_format: json_object`) to give
 *     us structured access to `answer` and `suggestedFollowups`.
 *   - Provider abstraction: swap `generateRagAnswer`'s internals to change
 *     the LLM without touching any route code.
 */

import OpenAI from "openai";
import { prisma } from "./prisma";
import { embedChunks } from "./embedder";
import type { DocumentSource } from "@ai-accounting/shared";

// ─── Constants ───────────────────────────────────────────────────

/** Minimum cosine similarity to include a chunk in results (0–1). */
export const SIMILARITY_THRESHOLD = 0.55;

/** Fallback threshold when the primary search returns no results. */
export const FALLBACK_SIMILARITY_THRESHOLD = 0.35;

/** Default max results returned to the caller after re-ranking. */
export const DEFAULT_LIMIT = 8;

/**
 * Recency decay scale in days.
 * A document 365 days old gets similarity × 0.5;
 * one 0 days old gets similarity × 1.0.
 */
export const RECENCY_SCALE_DAYS = 365;

/** How many rows to fetch from pgvector before threshold + recency filtering. */
const RETRIEVAL_LIMIT = 20;

/** LLM model for chat completions. */
export const CHAT_MODEL = "gpt-4o-mini";

/**
 * GPT-4o-mini pricing (USD per 1 M tokens).
 * Adjust here if OpenAI changes pricing.
 */
const COST_INPUT_PER_M_USD = 0.15;
const COST_OUTPUT_PER_M_USD = 0.6;

/** Approximate USD → INR conversion for cost display. */
const USD_TO_INR = 84;

// ─── Public types ────────────────────────────────────────────────

export interface SearchOptions {
  clientId?: string;
  dateFrom?: string;
  dateTo?: string;
  sources?: DocumentSource[];
  limit?: number;
  threshold?: number;
}

export interface SearchResult {
  chunkId: string;
  chunkText: string;
  documentId: string;
  filename: string;
  source: DocumentSource;
  sourceDate: Date;
  /** Raw cosine similarity [0, 1]. */
  similarity: number;
  /** Recency-weighted ranking score used for final ordering. */
  score: number;
}

export interface RagAnswer {
  answer: string;
  suggestedFollowups: string[];
  model: string;
  tokensPrompt: number;
  tokensCompletion: number;
  /** Estimated cost in Indian Rupees (two-decimal precision). */
  costInr: number;
}

// ─── Internal types ──────────────────────────────────────────────

/** Shape of rows returned by the raw pgvector similarity query. */
interface ChunkRow {
  chunk_id: string;
  chunk_text: string;
  document_id: string;
  filename: string;
  source: string;
  source_date: Date;
  similarity: number;
}

/** Minimal structure we expect from the LLM's JSON response. */
interface LlmJsonResponse {
  answer: string;
  suggestedFollowups: string[];
}

// ─── Lazy OpenAI client (completions only) ───────────────────────

let _completionClient: OpenAI | null = null;

function getCompletionClient(): OpenAI {
  if (!_completionClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
      throw new Error("OPENAI_API_KEY environment variable is not set.");
    _completionClient = new OpenAI({ apiKey });
  }
  return _completionClient;
}

// ─── searchChunks ────────────────────────────────────────────────

/**
 * Embed `query` then run a cosine similarity search over the firm's chunks.
 *
 * Steps:
 *  1. Embed the query text.
 *  2. Fetch the top `RETRIEVAL_LIMIT` rows from pgvector via raw SQL
 *     (ORDER BY cosine distance ASC so the index is used).
 *  3. Filter by `threshold` in JavaScript (avoids a computed-column index issue).
 *  4. Apply recency weighting: score = similarity × 1 / (1 + ageDays / scale).
 *  5. Sort by `score` descending, return the top `limit`.
 */
export async function searchChunks(
  query: string,
  firmId: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const {
    clientId,
    dateFrom,
    dateTo,
    sources,
    limit = DEFAULT_LIMIT,
    threshold = SIMILARITY_THRESHOLD,
  } = options;

  // 1. Embed the query
  const [queryResult] = await embedChunks([
    { chunkId: "query", chunkText: query },
  ]);
  if (!queryResult) return [];

  const vectorLiteral = `[${queryResult.embedding.join(",")}]`;

  // 2. Prepare optional filter parameters — null means "skip this filter".
  //    The query uses `param IS NULL OR <condition>` so each filter is
  //    only applied when the caller provides a value.
  const clientIdParam: string | null = clientId ?? null;
  const dateFromParam: Date | null = dateFrom ? new Date(dateFrom) : null;
  const dateToParam: Date | null = dateTo ? new Date(dateTo) : null;
  // pgvector array literal, e.g. "{gmail,drive}" or null
  const sourceArrayParam: string | null =
    sources && sources.length > 0 ? `{${sources.join(",")}}` : null;

  // 3. Cosine distance search (ORDER BY ASC so pgvector HNSW/IVFFlat index fires).
  //    Nullable params with IS NULL short-circuit the filter when absent.
  const rows = await prisma.$queryRaw<ChunkRow[]>`
    SELECT
      c.id                                                        AS chunk_id,
      c.chunk_text,
      c.document_id,
      d.filename,
      d.source::text                                              AS source,
      d.source_date,
      (1.0 - (c.embedding <=> ${vectorLiteral}::vector))          AS similarity
    FROM   chunks c
    JOIN   documents d ON d.id = c.document_id
    WHERE  c.firm_id = ${firmId}::uuid
      AND  c.embedding IS NOT NULL
      AND  (${clientIdParam}::uuid IS NULL OR c.client_id = ${clientIdParam}::uuid)
      AND  (${dateFromParam}::timestamptz IS NULL OR d.source_date >= ${dateFromParam}::timestamptz)
      AND  (${dateToParam}::timestamptz IS NULL OR d.source_date <= ${dateToParam}::timestamptz)
      AND  (${sourceArrayParam}::text[] IS NULL OR d.source::text = ANY(${sourceArrayParam}::text[]))
    ORDER  BY c.embedding <=> ${vectorLiteral}::vector ASC
    LIMIT  ${RETRIEVAL_LIMIT}
  `;

  if (rows.length === 0) return [];

  // 4. Threshold filter (done post-fetch to keep the query index-friendly)
  const filtered = rows.filter((r) => Number(r.similarity) >= threshold);
  if (filtered.length === 0) return [];

  // 5. Recency weighting + final sort
  const now = Date.now();
  const scored: SearchResult[] = filtered.map((row) => {
    const ageDays =
      (now - new Date(row.source_date).getTime()) / (1000 * 60 * 60 * 24);
    const recencyFactor = 1 / (1 + ageDays / RECENCY_SCALE_DAYS);
    const similarity = Number(row.similarity);
    return {
      chunkId: row.chunk_id,
      chunkText: row.chunk_text,
      documentId: row.document_id,
      filename: row.filename,
      source: row.source as DocumentSource,
      sourceDate: new Date(row.source_date),
      similarity,
      score: similarity * recencyFactor,
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ─── generateRagAnswer ───────────────────────────────────────────

/**
 * Generate an LLM answer grounded in the retrieved chunks.
 *
 * @param query     - The user's original question.
 * @param chunks    - Context chunks from `searchChunks` (may be empty).
 * @param firmId    - UUID of the firm — used to load the knowledge snapshot.
 * @returns         - Answer text, suggested follow-up questions, and token usage.
 */
export async function generateRagAnswer(
  query: string,
  chunks: SearchResult[],
  firmId?: string,
): Promise<RagAnswer> {
  const client = getCompletionClient();

  // Load firm knowledge snapshot if available
  let firmSnapshot: string | null = null;
  if (firmId) {
    try {
      const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { knowledgeSnapshot: true },
      });
      firmSnapshot = firm?.knowledgeSnapshot ?? null;
    } catch {
      // Non-fatal — proceed without snapshot
    }
  }

  const systemPrompt = buildSystemPrompt(chunks.length > 0, firmSnapshot);
  const userMessage = buildUserMessage(query, chunks);

  const completion = await client.chat.completions.create({
    model: CHAT_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.2, // low temperature for factual, grounded answers
    max_tokens: 1024,
  });

  const rawContent = completion.choices[0]?.message?.content ?? "{}";
  const usage = completion.usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  // Parse JSON response; fall back gracefully on malformed output
  let parsed: LlmJsonResponse;
  try {
    parsed = JSON.parse(rawContent) as LlmJsonResponse;
    if (typeof parsed.answer !== "string") throw new Error("missing answer");
  } catch {
    // Treat the raw content as the answer if JSON parsing fails
    parsed = {
      answer: rawContent.trim() || "I was unable to generate a response.",
      suggestedFollowups: [],
    };
  }

  const suggestedFollowups = Array.isArray(parsed.suggestedFollowups)
    ? parsed.suggestedFollowups.slice(0, 3).map(String)
    : [];

  const costInr =
    ((usage.prompt_tokens / 1_000_000) * COST_INPUT_PER_M_USD +
      (usage.completion_tokens / 1_000_000) * COST_OUTPUT_PER_M_USD) *
    USD_TO_INR;

  return {
    answer: parsed.answer,
    suggestedFollowups,
    model: completion.model ?? CHAT_MODEL,
    tokensPrompt: usage.prompt_tokens,
    tokensCompletion: usage.completion_tokens,
    costInr: Math.round(costInr * 10_000) / 10_000, // 4 decimal places
  };
}

// ─── Prompt builders ─────────────────────────────────────────────

function buildSystemPrompt(
  hasContext: boolean,
  firmSnapshot?: string | null,
): string {
  const base = `You are an expert AI assistant for Indian chartered accountants (CAs). \
You help accounting firms with questions about their clients' financial documents.

Response format: You MUST respond with valid JSON only, containing exactly these fields:
{
  "answer": "<your detailed answer here>",
  "suggestedFollowups": ["<question 1>", "<question 2>", "<question 3>"]
}

General guidelines:
- Use professional language appropriate for CA practice in India.
- Reference specific documents using [filename] notation where relevant.
- Keep follow-up questions concise and directly actionable.`;

  // Inject firm knowledge snapshot so the LLM knows what documents exist
  const snapshotBlock = firmSnapshot
    ? `\n\n--- FIRM KNOWLEDGE SNAPSHOT ---\nThe following is an overview of all documents indexed for this firm. Use it to understand what information is available, answer broad questions, and suggest relevant follow-ups.\n\n${firmSnapshot}\n--- END SNAPSHOT ---`
    : "";

  if (hasContext) {
    return (
      base +
      snapshotBlock +
      `

Context guidelines:
- Base your answer ONLY on the provided documents. Do not fabricate numbers, dates, or facts.
- If the documents don't fully answer the question, acknowledge the gap clearly.
- Cite the source document filename when you use information from it.`
    );
  }

  return (
    base +
    snapshotBlock +
    `

No documents found: No relevant documents were found for this query.
- Inform the user that no matching documents were found in the system.
- If the knowledge snapshot above lists documents that might be relevant, suggest the user refine their query.
- Suggest what types of documents (e.g., invoices, ledgers, bank statements, correspondence) might contain the answer.
- You may provide general guidance from Indian CA practice if appropriate.`
  );
}

function buildUserMessage(query: string, chunks: SearchResult[]): string {
  if (chunks.length === 0) {
    return `Question: ${query}`;
  }

  const contextBlocks = chunks
    .map((chunk, i) => {
      const dateStr = chunk.sourceDate.toISOString().split("T")[0];
      const sourceLabel =
        chunk.source === "gmail"
          ? "Gmail"
          : chunk.source === "drive"
            ? "Drive"
            : "Upload";
      return [
        `[${i + 1}] ${chunk.filename} — ${dateStr} (${sourceLabel})`,
        "─".repeat(50),
        chunk.chunkText,
      ].join("\n");
    })
    .join("\n\n");

  return `Relevant documents from the firm's records:\n\n${contextBlocks}\n\n${"─".repeat(50)}\nQuestion: ${query}`;
}
