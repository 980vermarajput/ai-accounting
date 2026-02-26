/**
 * OpenAI Token Usage Tracking & Spend Protection
 *
 * Prevents cost explosions by enforcing daily token limits per firm
 * and global usage monitoring.
 */

import { getRedis } from "./redis";
import { ApiError } from "./api-error";

// ─── Configuration ───────────────────────────────────

const DAILY_TOKEN_CAP_PER_FIRM = parseInt(process.env.DAILY_TOKEN_CAP_PER_FIRM || "50000");
const MAX_QUERY_TOKENS = parseInt(process.env.MAX_QUERY_TOKENS || "6000");
const DAILY_GLOBAL_TOKEN_ALERT = parseInt(process.env.DAILY_GLOBAL_TOKEN_ALERT || "500000");

const USAGE_PREFIX = "tokens:daily:";
const GLOBAL_USAGE_KEY = "tokens:daily:global";

// ─── Token Usage Tracking ───────────────────────────

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costEstimateInr: number;
}

/**
 * Check if a firm can use the requested tokens without exceeding daily limit.
 * Throws ApiError if limit would be exceeded.
 */
export async function checkTokenLimit(firmId: string, requestedTokens: number): Promise<void> {
  if (requestedTokens > MAX_QUERY_TOKENS) {
    throw ApiError.badRequest(
      `Query too large: ${requestedTokens} tokens exceeds limit of ${MAX_QUERY_TOKENS}`,
      "QUERY_TOKEN_LIMIT_EXCEEDED"
    );
  }

  try {
    const redis = getRedis();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const firmUsageKey = `${USAGE_PREFIX}${firmId}:${today}`;

    const currentUsage = await redis.get(firmUsageKey);
    const usedTokens = currentUsage ? parseInt(currentUsage) : 0;

    if (usedTokens + requestedTokens > DAILY_TOKEN_CAP_PER_FIRM) {
      throw ApiError.tooManyRequests(
        `Daily token limit exceeded. Used: ${usedTokens}, Requested: ${requestedTokens}, Limit: ${DAILY_TOKEN_CAP_PER_FIRM}`,
        "DAILY_TOKEN_LIMIT_EXCEEDED"
      );
    }
  } catch (error) {
    // If it's our ApiError, re-throw it
    if (error instanceof ApiError) {
      throw error;
    }

    // Redis failure - log but don't block (fail open for availability)
    console.error("[TOKEN_USAGE] Failed to check token limit:", error);
  }
}

/**
 * Record token usage after a successful API call.
 */
export async function recordTokenUsage(firmId: string, usage: TokenUsage): Promise<void> {
  try {
    const redis = getRedis();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Track per-firm usage
    const firmUsageKey = `${USAGE_PREFIX}${firmId}:${today}`;
    await redis.incrby(firmUsageKey, usage.totalTokens);
    await redis.expire(firmUsageKey, 86400 * 2); // 2 days retention

    // Track global usage for alerts
    const globalUsageKey = `${GLOBAL_USAGE_KEY}:${today}`;
    const newGlobalUsage = await redis.incrby(globalUsageKey, usage.totalTokens);
    await redis.expire(globalUsageKey, 86400 * 7); // 7 days retention

    // Alert on high global usage
    if (newGlobalUsage > DAILY_GLOBAL_TOKEN_ALERT) {
      console.warn(`[TOKEN_USAGE] High global token usage today: ${newGlobalUsage} tokens`);
    }

    // Log structured token usage for observability - this will be replaced by logger.tokenUsage() calls
    console.info("[TOKEN_USAGE]", {
      firmId,
      date: today,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      costInr: usage.costEstimateInr,
      type: "token_usage_recorded"
    });

  } catch (error) {
    // Don't fail the request if we can't record usage
    console.error("[TOKEN_USAGE] Failed to record token usage:", error);
  }
}

/**
 * Get current daily token usage for a firm.
 */
export async function getDailyTokenUsage(firmId: string): Promise<number> {
  try {
    const redis = getRedis();
    const today = new Date().toISOString().split('T')[0];
    const firmUsageKey = `${USAGE_PREFIX}${firmId}:${today}`;

    const usage = await redis.get(firmUsageKey);
    return usage ? parseInt(usage) : 0;
  } catch (error) {
    console.error("[TOKEN_USAGE] Failed to get daily usage:", error);
    return 0;
  }
}

/**
 * Calculate estimated token count for text (approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate INR cost from token usage.
 * Based on OpenAI pricing: prompt $0.15/1M, completion $0.6/1M tokens
 * USD to INR: ~83.5
 */
export function calculateCostInr(promptTokens: number, completionTokens: number): number {
  const promptCostUsd = (promptTokens * 0.15) / 1_000_000;
  const completionCostUsd = (completionTokens * 0.6) / 1_000_000;
  const totalCostUsd = promptCostUsd + completionCostUsd;
  return parseFloat((totalCostUsd * 83.5).toFixed(4));
}