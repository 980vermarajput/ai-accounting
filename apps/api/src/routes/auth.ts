import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import type { ApiResponse } from "@ai-accounting/shared";
import { requireAuth, blacklistToken } from "../middleware/auth";
import { rateLimitPublic } from "../middleware/rate-limiter";
import {
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleProfile,
  encrypt,
  signJwt,
} from "../lib/auth";
import { prisma } from "../lib/prisma";

export const authRouter: Router = Router();

// Public auth endpoints get IP-based rate limiting
authRouter.use(rateLimitPublic);

// ─── GET /api/auth/google — redirect to Google OAuth consent ─────
authRouter.get("/google", (req: Request, res: Response, next: NextFunction) => {
  try {
    const url = buildGoogleAuthUrl();
    res.redirect(url);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/auth/google/callback — exchange code for tokens ────
authRouter.get(
  "/google/callback",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code, error } = req.query;
      const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

      // User denied access on Google consent screen
      if (error) {
        return res.redirect(`${frontendUrl}/auth/error?reason=access_denied`);
      }

      if (!code || typeof code !== "string") {
        return res.redirect(`${frontendUrl}/auth/error?reason=missing_code`);
      }

      // 1. Exchange code for Google tokens
      const googleTokens = await exchangeCodeForTokens(code);

      // 2. Fetch user profile from Google
      const profile = await fetchGoogleProfile(googleTokens.accessToken);

      // 3. Encrypt refresh token before storing
      const encryptedRefreshToken = encrypt(googleTokens.refreshToken);

      // 4. Upsert user — find by email, or create with a new firm
      let user = await prisma.user.findUnique({
        where: { email: profile.email },
        include: { firm: true },
      });

      if (!user) {
        // First-ever login — create a new firm + user together
        const slug = profile.email
          .split("@")[0]
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-");

        // Ensure slug uniqueness by appending a short random suffix if needed
        const uniqueSlug = `${slug}-${Date.now().toString(36)}`;

        const newFirm = await prisma.firm.create({
          data: {
            name: `${profile.name}'s Firm`,
            slug: uniqueSlug,
            users: {
              create: {
                email: profile.email,
                name: profile.name,
                role: "admin",
                googleRefreshTokenEnc: Buffer.from(encryptedRefreshToken),
              },
            },
          },
          include: { users: true },
        });

        user = await prisma.user.findUnique({
          where: { email: profile.email },
          include: { firm: true },
        });

        if (!user) throw new Error("Failed to create user after firm creation");
      } else {
        // Returning user — update their refresh token
        await prisma.user.update({
          where: { id: user.id },
          data: {
            googleRefreshTokenEnc: Buffer.from(encryptedRefreshToken),
            lastSyncAt: null,
          },
        });
      }

      // 5. Issue JWT
      const token = signJwt({
        userId: user.id,
        firmId: user.firmId,
        email: user.email,
        role: user.role as "admin" | "member",
      });

      // 6. Set HttpOnly cookie + redirect to frontend
      //    Cookie is the primary auth mechanism (immune to XSS).
      //    We also pass the token as a query param so the frontend can
      //    still use Authorization header for API calls during transition.
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("__session", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "strict" : "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days — matches JWT expiry
      });

      res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/auth/logout — revoke session ─────────────────────
authRouter.post("/logout", requireAuth, async (req: Request, res: Response) => {
  // Blacklist the JWT in Redis so it can't be reused
  if (req.rawToken) {
    await blacklistToken(req.rawToken);
  }

  // Clear the HttpOnly cookie
  res.clearCookie("__session", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/",
  });

  const response: ApiResponse = {
    success: true,
    data: { message: "Logged out successfully" },
  };
  res.json(response);
});

// ─── GET /api/auth/me — return current user + firm info ─────────
authRouter.get(
  "/me",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          lastSyncAt: true,
          firm: {
            select: { id: true, name: true, slug: true, plan: true },
          },
        },
      });

      if (!user) {
        return next(new Error("User not found"));
      }

      const response: ApiResponse = {
        success: true,
        data: user,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);
