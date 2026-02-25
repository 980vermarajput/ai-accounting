/**
 * Drafts router — AI-powered email drafting for Indian CA firms.
 *
 * POST /api/drafts        — generate a new email draft (optionally RAG-grounded)
 * POST /api/drafts/refine — revise an existing draft based on new instructions
 *
 * No persistence: the client owns the draft text and passes it back on refine.
 * This keeps the schema lean — we don't need a DB table for ephemeral drafts.
 */

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import OpenAI from "openai";
import type { ApiResponse, DraftResponse } from "@ai-accounting/shared";
import { draftEmailSchema, refineDraftSchema } from "@ai-accounting/shared";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { searchChunks } from "../lib/rag";

export const draftsRouter: Router = Router();

// All draft routes require auth
draftsRouter.use(requireAuth);

// ─── OpenAI client (lazy singleton) ──────────────────────────────

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// ─── Cost constants ───────────────────────────────────────────────

const INR_PER_USD = 83.5;
const GPT4O_MINI_INPUT_COST_PER_TOKEN = 0.15 / 1_000_000; // $0.15 per 1M tokens
const GPT4O_MINI_OUTPUT_COST_PER_TOKEN = 0.6 / 1_000_000; // $0.60 per 1M tokens

function calcCostInr(promptTokens: number, completionTokens: number): number {
  const usd =
    promptTokens * GPT4O_MINI_INPUT_COST_PER_TOKEN +
    completionTokens * GPT4O_MINI_OUTPUT_COST_PER_TOKEN;
  return Math.round(usd * INR_PER_USD * 10_000) / 10_000;
}

// ─── POST /api/drafts — generate email draft ─────────────────────

draftsRouter.post(
  "/",
  validate(draftEmailSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    try {
      const { clientId, threadId, instructions, includeContext } = req.body as {
        clientId?: string;
        threadId?: string;
        instructions: string;
        includeContext: boolean;
      };
      const { firmId } = req.user!;

      // 1. Optionally retrieve context chunks from the vector store
      let contextBlock = "";
      let sources: DraftResponse["sources"] = [];

      if (includeContext) {
        const chunks = await searchChunks(instructions, firmId, {
          clientId,
          limit: 5,
          threshold: 0.65, // slightly lower threshold for drafting context
        });

        sources = chunks.map((c) => ({
          docId: c.documentId,
          filename: c.filename,
          excerpt: c.chunkText.slice(0, 200),
          sourceDate: c.sourceDate.toISOString(),
          relevanceScore: Math.round(c.score * 100) / 100,
        }));

        if (chunks.length > 0) {
          contextBlock =
            `\n\nRELEVANT CONTEXT FROM CLIENT FILES:\n` +
            chunks
              .map(
                (c, i) =>
                  `[${i + 1}] ${c.filename} (${c.sourceDate.toLocaleDateString("en-IN")})\n${c.chunkText}`,
              )
              .join("\n\n---\n\n");
        }
      }

      // 2. Build prompt
      const systemPrompt = `You are a professional email drafting assistant for a Chartered Accountant's office in India.
Write clear, professional, and concise emails following Indian business communication norms.
Always respond with a JSON object containing exactly these two fields:
{
  "subject": "Email subject line",
  "draftText": "Full email body with proper salutation, paragraphs, and sign-off"
}`;

      const userPrompt =
        `INSTRUCTIONS: ${instructions}` +
        (threadId ? `\nREPLYING TO THREAD ID: ${threadId}` : "") +
        contextBlock +
        (includeContext && sources.length > 0
          ? "\n\nUse the provided context to ensure factual accuracy."
          : "");

      // 3. Call GPT-4o-mini
      const openai = getOpenAI();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 1000,
      });

      // 4. Parse JSON response
      let subject = "";
      let draftText = "";
      const raw = completion.choices[0]?.message?.content ?? "{}";
      try {
        const parsed = JSON.parse(raw) as {
          subject?: string;
          draftText?: string;
        };
        subject = parsed.subject ?? "";
        draftText = parsed.draftText ?? raw;
      } catch {
        draftText = raw;
      }

      const promptTokens = completion.usage?.prompt_tokens ?? 0;
      const completionTokens = completion.usage?.completion_tokens ?? 0;

      const response: ApiResponse<DraftResponse> = {
        success: true,
        data: {
          subject,
          draftText,
          sources,
          metadata: {
            model: "gpt-4o-mini",
            tokensPrompt: promptTokens,
            tokensCompletion: completionTokens,
            costEstimateInr: calcCostInr(promptTokens, completionTokens),
            latencyMs: Date.now() - start,
          },
        },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/drafts/refine — revise an existing draft ──────────

draftsRouter.post(
  "/refine",
  validate(refineDraftSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    try {
      const { draftText, instructions } = req.body as {
        draftText: string;
        instructions: string;
      };

      const systemPrompt = `You are a professional email drafting assistant for a Chartered Accountant's office in India.
Revise the provided email draft according to the user's instructions while maintaining a professional tone.
Always respond with a JSON object containing exactly these two fields:
{
  "subject": "Updated subject line (keep existing if no change needed)",
  "draftText": "Revised full email body"
}`;

      const userPrompt = `CURRENT DRAFT:\n${draftText}\n\nREFINEMENT INSTRUCTIONS: ${instructions}`;

      const openai = getOpenAI();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 1000,
      });

      let subject = "";
      let refinedText = "";
      const raw = completion.choices[0]?.message?.content ?? "{}";
      try {
        const parsed = JSON.parse(raw) as {
          subject?: string;
          draftText?: string;
        };
        subject = parsed.subject ?? "";
        refinedText = parsed.draftText ?? raw;
      } catch {
        refinedText = raw;
      }

      const promptTokens = completion.usage?.prompt_tokens ?? 0;
      const completionTokens = completion.usage?.completion_tokens ?? 0;

      const response: ApiResponse<DraftResponse> = {
        success: true,
        data: {
          subject,
          draftText: refinedText,
          sources: [], // refinement doesn't add new context sources
          metadata: {
            model: "gpt-4o-mini",
            tokensPrompt: promptTokens,
            tokensCompletion: completionTokens,
            costEstimateInr: calcCostInr(promptTokens, completionTokens),
            latencyMs: Date.now() - start,
          },
        },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);
