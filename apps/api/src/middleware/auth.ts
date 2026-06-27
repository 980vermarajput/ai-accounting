import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../lib/api-error";
import { verifyJwt } from "../lib/auth";
import { getRedis } from "../lib/redis";
import { logger } from "../lib/logger";
import { withFirmContext } from "../lib/tenant-context";

/**
 * Authenticated user payload attached to req after JWT verification.
 */
export interface AuthUser {
  userId: string;
  firmId: string;
  email: string;
  role: "admin" | "member";
}

// Augment Express Request
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** The raw JWT token extracted from cookie or header, used for blacklisting on logout. */
      rawToken?: string;
    }
  }
}

/**
 * Auth middleware — verifies JWT from HttpOnly cookie or Authorization header.
 * Also checks Redis blacklist to honour logout.
 *
 * Token resolution order:
 *   1. `__session` HttpOnly cookie (preferred — immune to XSS)
 *   2. `Authorization: Bearer <token>` header (for API clients / dev tools)
 *
 * Dev shortcut: pass `X-Dev-User` header as JSON to bypass JWT:
 *   X-Dev-User: {"userId":"...","firmId":"...","email":"...","role":"admin"}
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  // ── Dev bypass (development only) ──
  if (process.env.NODE_ENV === "development") {
    const devHeader = req.headers["x-dev-user"];
    if (typeof devHeader === "string") {
      try {
        req.user = JSON.parse(devHeader) as AuthUser;
        return withFirmContext(req.user.firmId, () => next());
      } catch {
        // fall through to real JWT check
      }
    }
  } else if (req.headers["x-dev-user"]) {
    // Explicitly reject dev header in production
    return next(ApiError.forbidden("Dev auth header not allowed in production"));
  }

  // ── Extract token from cookie or header ──
  const cookieToken = req.cookies?.["__session"];
  const headerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;
  const token = cookieToken || headerToken;

  if (!token) {
    return next(ApiError.unauthorized("Missing or invalid Authorization header"));
  }

  // ── Verify JWT ──
  try {
    req.user = verifyJwt(token);
    req.rawToken = token;
  } catch (err) {
    return next(err);
  }

  // ── Check Redis blacklist (FAIL CLOSED for security) ──
  isBlacklisted(token)
    .then((blacklisted) => {
      if (blacklisted) {
        return next(
          ApiError.unauthorized("Session has been revoked — please sign in again"),
        );
      }
      // Carry the tenant context through the rest of the request so the RLS layer
      // (when enforcement is on) can scope every query to this firm.
      withFirmContext(req.user!.firmId, () => next());
    })
    .catch((err) => {
      // Redis down — FAIL CLOSED for security (reject potentially revoked tokens)
      logger.error("Redis blacklist check failed", {
        operation: "auth_blacklist_check",
        error: err.message,
        type: "infrastructure_error"
      });
      return next(
        ApiError.serviceUnavailable("Authentication service temporarily unavailable"),
      );
    });
}

/**
 * Restrict route to firm admins only. Must be used after requireAuth.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    return next(ApiError.forbidden("Admin access required"));
  }
  next();
}

// ─── JWT Blacklist helpers ────────────────────────────────────────

const BLACKLIST_PREFIX = "jwt:bl:";

/**
 * Add a token to the Redis blacklist.
 * TTL is set to the token's remaining validity so entries self-expire.
 */
export async function blacklistToken(token: string): Promise<void> {
  try {
    // Decode payload for expiry — token was already verified by requireAuth
    const parts = token.split(".");
    if (parts.length !== 3) return;
    const decoded = JSON.parse(Buffer.from(parts[1], "base64").toString()) as {
      exp?: number;
    };
    const expSeconds = decoded.exp ?? 0;
    const ttl = Math.max(expSeconds - Math.floor(Date.now() / 1000), 60);

    const redis = getRedis();
    await redis.set(`${BLACKLIST_PREFIX}${token}`, "1", "EX", ttl);
  } catch {
    // If we can't parse the token we can't blacklist it — but that's OK
    // because it's also invalid and won't pass verifyJwt
  }
}

/**
 * Check whether a token has been blacklisted.
 */
async function isBlacklisted(token: string): Promise<boolean> {
  const redis = getRedis();
  const val = await redis.get(`${BLACKLIST_PREFIX}${token}`);
  return val !== null;
}
