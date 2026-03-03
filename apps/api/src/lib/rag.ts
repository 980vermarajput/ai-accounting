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
import { getFirmAnalytics, getClientDetails, findUnassignedDocumentsForClient } from "./firm-tools";
import type { DocumentSource } from "@ai-accounting/shared";

// ─── Constants ───────────────────────────────────────────────────

/** Minimum cosine similarity to include a chunk in results (0–1). */
export const SIMILARITY_THRESHOLD = 0.55;

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

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ConfidenceInfo {
  level: ConfidenceLevel;
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
  /** Whether the answer was served from cache. */
  cached?: boolean;
  /** AI tools that were used during generation */
  toolsUsed?: string[];
  /** Whether multi-step thinking/search was performed */
  multiStepThinking?: boolean;
}

/**
 * Compute a confidence score for a RAG answer based on:
 *   - Average similarity of retrieved chunks (60% weight)
 *   - Context coverage ratio — how many chunks vs DEFAULT_LIMIT (30% weight)
 *   - Recency — average recency factor of chunks (10% weight)
 *
 * Returns { level, score } where level maps score to high/medium/low.
 */
export function computeConfidence(chunks: SearchResult[]): ConfidenceInfo {
  if (chunks.length === 0) {
    return { level: "low", score: 0 };
  }

  const avgSimilarity =
    chunks.reduce((sum, c) => sum + c.similarity, 0) / chunks.length;

  const coverageRatio = Math.min(chunks.length / DEFAULT_LIMIT, 1);

  const now = Date.now();
  const avgRecency =
    chunks.reduce((sum, c) => {
      const ageDays =
        (now - new Date(c.sourceDate).getTime()) / (1000 * 60 * 60 * 24);
      return sum + 1 / (1 + ageDays / RECENCY_SCALE_DAYS);
    }, 0) / chunks.length;

  const score =
    Math.round(
      (avgSimilarity * 0.6 + coverageRatio * 0.3 + avgRecency * 0.1) * 100,
    ) / 100;

  let level: ConfidenceLevel;
  if (score > 0.75) level = "high";
  else if (score >= 0.55) level = "medium";
  else level = "low";

  return { level, score };
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

  // Define function tools for firm analytics
  const tools = [
    {
      type: "function" as const,
      function: {
        name: "get_firm_analytics",
        description: "Get comprehensive firm statistics including client counts, document assignment status, unassigned documents, and overall firm metrics",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    },
    {
      type: "function" as const,
      function: {
        name: "get_client_details",
        description: "Get detailed information about a specific client including recent documents and activity",
        parameters: {
          type: "object",
          properties: {
            clientName: {
              type: "string",
              description: "Name of the client to get details for"
            }
          },
          required: ["clientName"]
        }
      }
    },
    {
      type: "function" as const,
      function: {
        name: "find_unassigned_documents",
        description: "Find unassigned documents that might belong to a specific client based on email or domain",
        parameters: {
          type: "object",
          properties: {
            emailOrDomain: {
              type: "string",
              description: "Email address or domain to search for in unassigned documents"
            }
          },
          required: ["emailOrDomain"]
        }
      }
    },
    {
      type: "function" as const,
      function: {
        name: "search_documents_with_query",
        description: "Perform an additional document search with a refined or alternative query to find more specific information. Use this when the initial search results are not sufficient to answer the user's question completely.",
        parameters: {
          type: "object",
          properties: {
            searchQuery: {
              type: "string",
              description: "The refined or alternative search query to find more relevant documents"
            },
            reasoning: {
              type: "string",
              description: "Brief explanation of why this additional search is needed"
            }
          },
          required: ["searchQuery", "reasoning"]
        }
      }
    }
  ];

  let messages: Array<any> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  // First completion - may include tool calls
  const completion = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    tools,
    tool_choice: "auto", // Let the model decide when to use tools
    temperature: 0.2,
    max_tokens: 1024,
  });

  const message = completion.choices[0]?.message;

  // Handle tool calls if present
  if (message?.tool_calls) {
    messages.push(message); // Add the assistant's message with tool calls

    // Track which tools were used
    const toolsUsed: string[] = [];
    let multiStepThinking = false;

    // Process each tool call
    for (const toolCall of message.tool_calls) {
      if (toolCall.type === "function") {
        toolsUsed.push(toolCall.function.name);
      }
      try {
        let toolResult: any = null;

        if (toolCall.type === "function" && toolCall.function.name === "get_firm_analytics") {
          toolResult = await getFirmAnalytics(firmId!);
        } else if (toolCall.type === "function" && toolCall.function.name === "get_client_details") {
          const args = JSON.parse(toolCall.function.arguments);
          toolResult = await getClientDetails(firmId!, args.clientName);
        } else if (toolCall.type === "function" && toolCall.function.name === "find_unassigned_documents") {
          const args = JSON.parse(toolCall.function.arguments);
          toolResult = await findUnassignedDocumentsForClient(firmId!, args.emailOrDomain);
        } else if (toolCall.type === "function" && toolCall.function.name === "search_documents_with_query") {
          const args = JSON.parse(toolCall.function.arguments);
          multiStepThinking = true; // Mark that multi-step thinking occurred
          // Perform additional document search with the refined query
          const additionalResults = await searchChunks(args.searchQuery, firmId!);
          toolResult = {
            reasoning: args.reasoning,
            searchQuery: args.searchQuery,
            additionalDocuments: additionalResults.length,
            results: additionalResults.map(result => ({
              filename: result.filename,
              excerpt: result.chunkText.substring(0, 200) + "...",
              relevanceScore: result.score,
              sourceDate: result.sourceDate
            }))
          };
        }

        // Add tool result to messages
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult, null, 2)
        });
      } catch (error) {
        // Add error message for failed tool call
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: "Failed to execute tool call" })
        });
      }
    }

    // Second completion with tool results
    const finalCompletion = await client.chat.completions.create({
      model: CHAT_MODEL,
      response_format: { type: "json_object" },
      messages,
      temperature: 0.2,
      max_tokens: 1024,
    });

    // Use the final completion for response parsing
    const finalRawContent = finalCompletion.choices[0]?.message?.content ?? "{}";
    const finalUsage = {
      prompt_tokens: (completion.usage?.prompt_tokens || 0) + (finalCompletion.usage?.prompt_tokens || 0),
      completion_tokens: (completion.usage?.completion_tokens || 0) + (finalCompletion.usage?.completion_tokens || 0),
      total_tokens: (completion.usage?.total_tokens || 0) + (finalCompletion.usage?.total_tokens || 0)
    };

    return parseCompletionResponse(finalRawContent, finalUsage, toolsUsed, multiStepThinking);
  }

  // No tool calls, handle normal response
  const rawContent = completion.choices[0]?.message?.content ?? "{}";
  const usage = completion.usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  return parseCompletionResponse(rawContent, usage);
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
- Keep follow-up questions concise and directly actionable.
- If the initial search results don't provide sufficient information to fully answer a question, use the search_documents_with_query function to perform additional searches with refined queries.
- Think step by step and be thorough in gathering all relevant information before providing your final answer.`;

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
- If the documents don't fully answer the question, first try using search_documents_with_query to find additional relevant information before acknowledging any gaps.
- Cite the source document filename when you use information from it.
- Use multiple search queries with different keywords or approaches if needed to gather comprehensive information.`
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

/**
 * Helper function to parse completion response and calculate costs
 */
function parseCompletionResponse(
  rawContent: string,
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number },
  toolsUsed?: string[],
  multiStepThinking?: boolean
) {
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
    model: CHAT_MODEL,
    tokensPrompt: usage.prompt_tokens,
    tokensCompletion: usage.completion_tokens,
    costInr: Math.round(costInr * 10_000) / 10_000, // 4 decimal places
    toolsUsed: toolsUsed || [],
    multiStepThinking: multiStepThinking || false,
  };
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
