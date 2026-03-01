/**
 * Daily Briefing Generator — AI-powered daily briefing for each firm.
 *
 * Uses GPT-4o-mini to generate a concise 150-200 word structured briefing
 * based on the firm's alerts and recent client activity.
 *
 * Cost control: max 500 tokens output
 * Cache: Redis key `briefing:{firmId}:{YYYY-MM-DD}` TTL 23hr
 * Idempotent: if briefing exists for today, return cached version
 */

import OpenAI from "openai";
import { prisma } from "./prisma";
import { getRedis } from "./redis";
import { logger } from "./logger";
import { checkTokenLimit, recordTokenUsage, calculateCostInr } from "./token-usage";

// ─── Constants ───────────────────────────────────────

const BRIEFING_MODEL = "gpt-4o-mini";
const MAX_COMPLETION_TOKENS = 500;
const REDIS_TTL_SECONDS = 23 * 60 * 60; // 23 hours

// ─── Lazy OpenAI client ──────────────────────────────

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// ─── Helpers ─────────────────────────────────────────

function todayKey(firmId: string): string {
  const today = new Date().toISOString().split("T")[0];
  return `briefing:${firmId}:${today}`;
}

function todayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Main ────────────────────────────────────────────

export interface DailyBriefingResult {
  id: string;
  firmId: string;
  date: Date;
  summary: string;
  clientCount: number;
  alertCount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Generate (or return cached) the daily briefing for a firm.
 */
export async function generateDailyBriefing(
  firmId: string,
): Promise<DailyBriefingResult> {
  const today = todayDate();

  // 1. Check DB for today's briefing (idempotent)
  const existing = await prisma.dailyBriefing.findUnique({
    where: { firmId_date: { firmId, date: today } },
  });

  if (existing) {
    return existing as unknown as DailyBriefingResult;
  }

  // 2. Check Redis cache
  try {
    const redis = getRedis();
    const cached = await redis.get(todayKey(firmId));
    if (cached) {
      const parsed = JSON.parse(cached) as DailyBriefingResult;
      return parsed;
    }
  } catch {
    // Redis miss is fine, generate fresh
  }

  // 3. Gather context data
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [alerts, clientCount, documentsLast7Days, queriesLast7Days, topClients] =
    await Promise.all([
      prisma.alert.findMany({
        where: { firmId, isRead: false },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        take: 20,
        include: { client: { select: { name: true } } },
      }),
      prisma.client.count({ where: { firmId } }),
      prisma.document.count({
        where: { firmId, createdAt: { gt: sevenDaysAgo } },
      }),
      prisma.query.count({
        where: { firmId, createdAt: { gt: sevenDaysAgo } },
      }),
      prisma.client.findMany({
        where: {
          firmId,
          documents: { some: { createdAt: { gt: thirtyDaysAgo } } },
        },
        select: {
          name: true,
          _count: {
            select: {
              documents: { where: { createdAt: { gt: thirtyDaysAgo } } },
            },
          },
        },
        orderBy: { documents: { _count: "desc" } },
        take: 5,
      }),
    ]);

  // 4. Build prompt
  const alertSummary = alerts.map((a) => ({
    type: a.type,
    severity: a.severity,
    title: a.title,
    client: a.client?.name ?? "N/A",
  }));

  const topClientsData = topClients.map((c) => ({
    name: c.name,
    documents: c._count.documents,
  }));

  const userContext = JSON.stringify({
    date: new Date().toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    alertCount: alerts.length,
    alerts: alertSummary.slice(0, 10),
    clientCount,
    documentsLast7Days,
    queriesLast7Days,
    topClients: topClientsData,
  });

  // 5. Check token limit before calling LLM
  await checkTokenLimit(firmId, MAX_COMPLETION_TOKENS);

  // 6. Call LLM
  const startMs = Date.now();
  const openai = getOpenAI();

  const completion = await openai.chat.completions.create({
    model: BRIEFING_MODEL,
    max_tokens: MAX_COMPLETION_TOKENS,
    messages: [
      {
        role: "system",
        content:
          "You are a senior CA firm assistant. Generate a concise daily briefing " +
          "for the firm partner. Be factual and professional. Use Indian accounting context. " +
          "Format: 2-3 sentences of summary, then bullet points of actions needed. " +
          "Keep it under 200 words.",
      },
      {
        role: "user",
        content: userContext,
      },
    ],
  });

  const latencyMs = Date.now() - startMs;
  const summary =
    completion.choices[0]?.message?.content?.trim() ?? "No briefing could be generated.";
  const promptTokens = completion.usage?.prompt_tokens ?? 0;
  const completionTokens = completion.usage?.completion_tokens ?? 0;

  // 7. Record token usage
  const costInr = calculateCostInr(promptTokens, completionTokens);
  await recordTokenUsage(firmId, {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    costEstimateInr: costInr,
  });

  logger.tokenUsage({
    firmId,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    costInr,
    sourceOperation: "daily_briefing",
  });

  // 8. Store in DB
  const briefing = await prisma.dailyBriefing.create({
    data: {
      firmId,
      date: today,
      summary,
      clientCount,
      alertCount: alerts.length,
      metadata: {
        model: BRIEFING_MODEL,
        promptTokens,
        completionTokens,
        costInr,
        latencyMs,
      },
    },
  });

  // 9. Cache in Redis
  try {
    const redis = getRedis();
    await redis.set(todayKey(firmId), JSON.stringify(briefing), "EX", REDIS_TTL_SECONDS);
  } catch {
    // Non-critical — Redis cache miss won't break anything
  }

  logger.info("Daily briefing generated", {
    firmId,
    operation: "daily_briefing",
    duration: latencyMs,
    alertCount: alerts.length,
    clientCount,
  });

  return briefing as unknown as DailyBriefingResult;
}
