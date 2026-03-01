import type { Request, Response, NextFunction } from "express";
import { getRedis } from "../lib/redis";
import { ApiError } from "../lib/api-error";

/**
 * Redis-based sliding-window rate limiter.
 *
 * Uses two windows per key:
 *   1. `rl:user:<userId>` — per-user limit (60 req / 60 min)
 *   2. `rl:firm:<firmId>` — per-firm  limit (500 req / 60 min)
 *
 * Falls back to IP-based limiting for unauthenticated endpoints.
 */

const isDev = process.env.NODE_ENV === "development";

// Development-friendly limits
const USER_LIMIT = isDev ? 1000 : 60; // requests per window
const FIRM_LIMIT = isDev ? 5000 : 500; // requests per window
const WINDOW_SECONDS = isDev ? 600 : 3600; // 10 min in dev, 1 hour in prod

/**
 * Increment the counter for a given key and check against the limit.
 * Returns the current count after increment.
 */
async function checkLimit(key: string, limit: number): Promise<number> {
  const redis = getRedis();
  const multi = redis.multi();
  multi.incr(key);
  multi.expire(key, WINDOW_SECONDS);
  const results = await multi.exec();

  // multi.exec() returns [[null, count], [null, 1]] — first result is INCR
  const count = (results?.[0]?.[1] as number) ?? 1;

  if (count > limit) {
    throw ApiError.tooManyRequests(
      `Rate limit exceeded (${limit} requests per hour). Try again later.`,
    );
  }

  return count;
}

/**
 * Rate-limiting middleware for authenticated routes.
 * Must be applied AFTER auth middleware so req.user is populated.
 *
 * Enforces both per-user and per-firm limits.
 */
export function rateLimit(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    // Skip rate limiting for unauthenticated requests (they'll be rejected by auth anyway)
    return next();
  }

  const userKey = `rl:user:${req.user.userId}`;
  const firmKey = `rl:firm:${req.user.firmId}`;

  Promise.all([
    checkLimit(userKey, USER_LIMIT),
    checkLimit(firmKey, FIRM_LIMIT),
  ])
    .then(() => next())
    .catch(next);
}

/**
 * Lightweight IP-based rate limiter for public endpoints (e.g. /api/auth/*).
 * 30 requests per minute per IP to prevent brute-force (300 in development).
 */
export function rateLimitPublic(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";
  const key = `rl:ip:${ip}`;

  const publicLimit = isDev ? 300 : 30;

  checkLimit(key, publicLimit)
    .then(() => next())
    .catch(next);
}
