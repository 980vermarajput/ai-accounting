/**
 * Embedding service — wraps the OpenAI text-embedding-3-small model.
 *
 * Design decisions:
 *  - Batches up to 100 chunks per API request (OpenAI limit is 2048 items,
 *    but 100 keeps latency reasonable and token cost predictable).
 *  - Returns raw number[] vectors; callers store them via raw SQL because
 *    Prisma doesn't natively support the `vector` pgvector column type.
 *  - The OpenAI client is built lazily on first use so tests don't need
 *    `OPENAI_API_KEY` unless they actually call the API.
 */

import OpenAI from "openai";

// ─── Constants ───────────────────────────────────────────────────

/** Model name — swap here if we move to a larger model later. */
export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Dimensionality matches the `vector(1536)` column in the schema. */
export const EMBEDDING_DIMENSIONS = 1536;

/** Max items per OpenAI embeddings API call. */
const BATCH_SIZE = 100;

// ─── Public types ────────────────────────────────────────────────

export interface ChunkToEmbed {
  /** Prisma Chunk `id` (UUID). */
  chunkId: string;
  /** Plain text to embed. */
  chunkText: string;
}

export interface EmbedResult {
  chunkId: string;
  /** Raw 1536-dimensional float vector. */
  embedding: number[];
}

// ─── Lazy client ────────────────────────────────────────────────

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

// ─── Main function ───────────────────────────────────────────────

/**
 * Embed an array of chunks in batches of up to 100.
 *
 * @param chunks - Array of `{ chunkId, chunkText }` objects.
 * @returns      - Array of `{ chunkId, embedding }` in the same order as input.
 */
export async function embedChunks(
  chunks: ChunkToEmbed[],
): Promise<EmbedResult[]> {
  if (chunks.length === 0) return [];

  const client = getClient();
  const results: EmbedResult[] = [];

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map((c) => c.chunkText),
      dimensions: EMBEDDING_DIMENSIONS,
    });

    // OpenAI preserves input order in the response
    for (const item of response.data) {
      results.push({
        chunkId: batch[item.index].chunkId,
        embedding: item.embedding,
      });
    }
  }

  return results;
}
