import { Request, Response, NextFunction } from "express";
import { ApiError } from "../lib/api-error";

/**
 * Authenticated user payload attached to req after JWT verification.
 * Extends Express Request via declaration merging (see types/express.d.ts).
 */
export interface AuthUser {
  userId: string;
  firmId: string;
  email: string;
  role: "admin" | "member";
}

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Stub auth middleware — will be replaced with real JWT verification
 * once Google OAuth is wired up. For now reads a header.
 *
 * In development, pass `X-Dev-User` header as JSON to bypass auth:
 *   X-Dev-User: {"userId":"...","firmId":"...","email":"...","role":"admin"}
 */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // ── Dev bypass ──
  if (process.env.NODE_ENV === "development") {
    const devHeader = req.headers["x-dev-user"];
    if (typeof devHeader === "string") {
      try {
        req.user = JSON.parse(devHeader) as AuthUser;
        return next();
      } catch {
        // fall through
      }
    }
  }

  // ── Real JWT check (TODO: implement with jsonwebtoken) ──
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Missing or invalid Authorization header");
  }

  // TODO: verify JWT, extract payload, set req.user
  throw ApiError.unauthorized("JWT verification not yet implemented");
}

/**
 * Restrict route to firm admins only. Must be used after requireAuth.
 */
export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.user?.role !== "admin") {
    throw ApiError.forbidden("Admin access required");
  }
  next();
}
