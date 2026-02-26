/**
 * Drafts router — AI-powered email drafting for Indian CA firms.
 *
 * POST /api/drafts          — generate a new email draft (optionally RAG-grounded)
 * POST /api/drafts/refine   — revise an existing draft based on new instructions
 * POST /api/drafts/send     — save draft to Gmail via Drafts API
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
import { google } from "googleapis";
import type {
  ApiResponse,
  DraftResponse,
  GmailDraftResponse,
} from "@ai-accounting/shared";
import {
  draftEmailSchema,
  refineDraftSchema,
  sendDraftSchema,
} from "@ai-accounting/shared";
import { requireAuth } from "../middleware/auth";
import {
  checkTokenLimit,
  recordTokenUsage,
  estimateTokens,
  calculateCostInr,
} from "../lib/token-usage";
import { rateLimit } from "../middleware/rate-limiter";
import { validate } from "../middleware/validate";
import { searchChunks } from "../lib/rag";
import { prisma } from "../lib/prisma";
import { decrypt } from "../lib/auth";
import { ApiError } from "../lib/api-error";

export const draftsRouter: Router = Router();

// All draft routes require auth + rate limiting
draftsRouter.use(requireAuth);
draftsRouter.use(rateLimit);

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

      // 3. Check token limit before processing
      const estimatedTokens = estimateTokens(instructions + contextBlock) + 1000; // Include max_tokens
      await checkTokenLimit(req.user!.firmId, estimatedTokens);

      // 4. Call GPT-4o-mini
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

      // 5. Parse JSON response
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

      // 6. Record token usage for spend tracking
      await recordTokenUsage(req.user!.firmId, {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        costEstimateInr: calcCostInr(promptTokens, completionTokens),
      });

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

      // Check token limit before processing
      const estimatedTokens = estimateTokens(draftText + instructions) + 1000; // Include max_tokens
      await checkTokenLimit(req.user!.firmId, estimatedTokens);

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

      // Record token usage for spend tracking
      await recordTokenUsage(req.user!.firmId, {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        costEstimateInr: calcCostInr(promptTokens, completionTokens),
      });

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

// ─── POST /api/drafts/send — save draft to Gmail ─────────────────

draftsRouter.post(
  "/send",
  validate(sendDraftSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { to, subject, body, threadId } = req.body as {
        to: string;
        subject: string;
        body: string;
        threadId?: string;
      };
      const { userId } = req.user!;

      // 1. Load user + decrypt their Google refresh token
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { googleRefreshTokenEnc: true, email: true },
      });

      if (!user.googleRefreshTokenEnc) {
        throw ApiError.badRequest(
          "Google account not connected — sign in via Google OAuth to enable Gmail features.",
        );
      }

      const refreshToken = decrypt(
        Buffer.from(user.googleRefreshTokenEnc).toString("utf8"),
      );

      // 2. Create Google OAuth2 client
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI,
      );
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      // 3. Build RFC 2822 message
      const messageParts = [
        `From: ${user.email}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        "Content-Type: text/plain; charset=utf-8",
        "MIME-Version: 1.0",
        "",
        body,
      ];
      const rawMessage = Buffer.from(messageParts.join("\r\n"))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      // 4. Create Gmail draft (not send — user can review + send from Gmail)
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const draftRes = await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: {
            raw: rawMessage,
            ...(threadId ? { threadId } : {}),
          },
        },
      });

      const gmailDraftId = draftRes.data.id;
      const gmailMessageId = draftRes.data.message?.id;

      if (!gmailDraftId || !gmailMessageId) {
        throw ApiError.internal("Gmail returned an incomplete draft response.");
      }

      const response: ApiResponse<GmailDraftResponse> = {
        success: true,
        data: {
          gmailDraftId,
          gmailMessageId,
          threadId: draftRes.data.message?.threadId ?? undefined,
        },
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);
