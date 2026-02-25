import { Request, Response, NextFunction } from "express";
import { ApiError } from "../lib/api-error";
import { verifyJwt } from "../lib/auth";

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
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Auth middleware — verifies JWT from Authorization header.
 *
 * Dev shortcut: pass `X-Dev-User` header as JSON to bypass JWT:
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
        // fall through to real JWT check
      }
    }
  }

  // ── Real JWT verification ──
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next(
      ApiError.unauthorized("Missing or invalid Authorization header"),
    );
  }

  const token = authHeader.slice(7); // strip "Bearer "
  try {
    req.user = verifyJwt(token);
    next();
  } catch (err) {
    next(err);
  }
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
    return next(ApiError.forbidden("Admin access required"));
  }
  next();
}
