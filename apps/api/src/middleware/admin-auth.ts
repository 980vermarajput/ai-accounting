import type { Request, Response, NextFunction } from "express";
import type { ApiResponse } from "@ai-accounting/shared";
import { verifyJwt } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

/**
 * Platform admin authentication middleware
 * Unlike regular auth, this bypasses firm context and only checks for platform admin users
 * Used for admin dashboard endpoints that need access to all firms
 */
export async function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    console.log("🔍 Admin auth middleware hit:", req.path, req.method);
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid Authorization header",
        },
      };
      res.status(401).json(response);
      return;
    }

    const token = authHeader.slice(7);
    console.log("🔐 Token extracted:", token.substring(0, 20) + "...");
    const decoded = verifyJwt(token);
    console.log("🔓 Token decoded:", decoded ? "SUCCESS" : "FAILED");

    if (!decoded) {
      console.log("❌ Token verification failed");
      const response: ApiResponse = {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid token" },
      };
      res.status(401).json(response);
      return;
    }

    // Get user details with admin check
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isAdmin: true,
        firmId: true,
        firm: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!user) {
      const response: ApiResponse = {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not found" },
      };
      res.status(401).json(response);
      return;
    }

    // Check if user is a platform admin
    if (!user.isAdmin) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Platform admin access required",
        },
      };
      res.status(403).json(response);
      return;
    }

    // Attach admin user info to request (note: no firmId restriction)
    req.adminUser = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isAdmin: user.isAdmin,
      firmId: user.firmId, // For reference, but admin can access all firms
      firm: user.firm,
    };

    // Also set req.user for compatibility with rate limiter and other middleware
    req.user = {
      userId: user.id,
      email: user.email,
      firmId: user.firmId,
      role: user.role,
    };

    // Log admin access for audit trail
    await prisma.auditLog.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        action: "admin_access",
        resourceType: "platform",
        details: {
          endpoint: req.path,
          method: req.method,
          userAgent: (req.headers["user-agent"] || null) as string | null,
        },
        ipAddress: req.ip || null,
      },
    });

    logger.info("Platform admin access", {
      userId: user.id,
      email: user.email,
      endpoint: req.path,
      method: req.method,
      ip: req.ip,
    });

    next();
  } catch (error) {
    logger.error("Admin auth middleware error", {
      error: error instanceof Error ? error.message : String(error),
    });
    const response: ApiResponse = {
      success: false,
      error: { code: "SERVER_ERROR", message: "Authentication failed" },
    };
    res.status(500).json(response);
  }
}

// Extend Express Request type for admin user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- required for Express Request augmentation
  namespace Express {
    interface Request {
      adminUser?: {
        userId: string;
        email: string;
        name: string;
        role: string;
        isAdmin: boolean;
        firmId: string;
        firm: {
          id: string;
          name: string;
          slug: string;
        };
      };
    }
  }
}