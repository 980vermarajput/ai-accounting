import { Router, Request, Response } from "express";
import type { ApiResponse } from "@ai-accounting/shared";
import { requireAuth } from "../middleware/auth";

export const authRouter: Router = Router();

// ─── GET /api/auth/google — redirect to Google OAuth consent ─────
authRouter.get("/google", (_req: Request, res: Response) => {
  // TODO: build Google OAuth URL with PKCE, scopes = gmail.readonly + drive.readonly
  const response: ApiResponse = {
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "Google OAuth redirect not yet implemented",
    },
  };
  res.status(501).json(response);
});

// ─── GET /api/auth/google/callback — exchange code for tokens ────
authRouter.get("/google/callback", async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code || typeof code !== "string") {
    const response: ApiResponse = {
      success: false,
      error: { code: "BAD_REQUEST", message: "Missing authorization code" },
    };
    res.status(400).json(response);
    return;
  }

  // TODO:
  // 1. Exchange code for access + refresh tokens
  // 2. Fetch user profile from Google
  // 3. Upsert user in DB (find or create firm)
  // 4. Encrypt refresh token with AES-256-GCM
  // 5. Issue JWT session token
  // 6. Redirect to frontend with token

  const response: ApiResponse = {
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "OAuth callback not yet implemented",
    },
  };
  res.status(501).json(response);
});

// ─── POST /api/auth/logout — revoke session ─────────────────────
authRouter.post("/logout", requireAuth, (_req: Request, res: Response) => {
  // TODO: invalidate JWT (add to blacklist in Redis) / clear refresh token
  const response: ApiResponse = {
    success: true,
    data: { message: "Logged out successfully" },
  };
  res.json(response);
});

// ─── GET /api/auth/me — return current user + firm info ─────────
authRouter.get("/me", requireAuth, (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    data: {
      userId: req.user!.userId,
      firmId: req.user!.firmId,
      email: req.user!.email,
      role: req.user!.role,
    },
  };
  res.json(response);
});
