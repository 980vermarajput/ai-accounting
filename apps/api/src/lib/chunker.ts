/**
 * Sentence-aware text chunker for RAG pipelines.
 *
 * Strategy:
 *   - Splits input text into sentence fragments using punctuation boundaries.
 *   - Groups sentences into chunks, targeting 900 tokens with a 1 200-token cap.
 *   - Carries a ~200-token overlap from the end of each chunk into the next,
 *     so semantically related sentences straddle chunk boundaries gracefully.
 *
 * Token approximation: 4 chars ≈ 1 token (avoids a heavy tokenizer dependency
 * while being accurate enough for chunking purposes).
 */

// ─── Public types ────────────────────────────────────────────────

/** A single chunk, ready for insertion into the `chunks` DB table. */
export interface ChunkInput {
  /** Trimmed plain text of this chunk. */
  chunkText: string;
  /** Approximate token count (chars / 4). */
  tokenCount: number;
  /** 0-based sequential index within the parent document. */
  chunkIndex: number;
}

// ─── Tuning constants ─────────────────────────────────────────────

const CHARS_PER_TOKEN = 4;
/** Stop adding sentences once we reach this many tokens. */
const TARGET_TOKENS = 900;
/** Hard cap — never exceed this, even for a single long sentence. */
const MAX_TOKENS = 1200;
/** How many tokens to carry from the previous chunk as overlap. */
const OVERLAP_TOKENS = 200;

// ─── Helpers ──────────────────────────────────────────────────────

function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

/**
 * Split text into sentence-sized fragments.
 *
 * Each fragment includes its trailing punctuation and whitespace so that
 * re-joining produces the original text faithfully.
 */
function toSentences(text: string): string[] {
  // Match: non-punctuation content + terminal punctuation/newline + trailing space
  const matches = text.match(/[^.!?\n]+(?:[.!?\n]+\s*)/g);
  if (!matches || matches.length === 0) return [text];

  // The last fragment may lack terminal punctuation — append as remainder
  const joined = matches.join("");
  const remainder = text.slice(joined.length).trim();
  if (remainder) matches.push(remainder);

  return matches;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Split plain text into overlapping chunks suitable for embedding.
 *
 * @param text - Normalized plain text (output of `extractText`)
 * @returns    - Array of `ChunkInput`, ordered by `chunkIndex`
 */
export function chunkText(text: string): ChunkInput[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sentences = toSentences(trimmed);
  const chunks: ChunkInput[] = [];
  let chunkIndex = 0;
  let i = 0;

  while (i < sentences.length) {
    const window: string[] = [];
    let tokens = 0;

    // ── Fill the current chunk window ────────────────────────────
    while (i < sentences.length) {
      const sent = sentences[i];
      const t = approxTokens(sent);

      // Stop if adding this sentence would blow the hard cap
      // (but always include at least one sentence to avoid infinite loops)
      if (tokens + t > MAX_TOKENS && window.length > 0) break;

      window.push(sent);
      tokens += t;
      i++;

      // Stop early once we hit the target
      if (tokens >= TARGET_TOKENS) break;
    }

    const chunkStr = window.join("").trim();
    if (chunkStr) {
      chunks.push({
        chunkText: chunkStr,
        tokenCount: tokens,
        chunkIndex: chunkIndex++,
      });
    }

    // ── Overlap: rewind `i` by sentences that fit within OVERLAP_TOKENS ──
    if (i < sentences.length) {
      let overlapTokens = 0;
      let rewind = 0;

      for (let j = window.length - 1; j >= 0; j--) {
        const t = approxTokens(window[j]);
        if (overlapTokens + t > OVERLAP_TOKENS) break;
        overlapTokens += t;
        rewind++;
      }

      i -= rewind;
    }
  }

  return chunks;
}
