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
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";

export const authRouter: Router = Router();

// Public auth endpoints get IP-based rate limiting
authRouter.use(rateLimitPublic);

// ─── GET /api/auth/google — redirect to Google OAuth consent ─────
authRouter.get("/google", (req: Request, res: Response, next: NextFunction) => {
  try {
    // If an invite token is passed as ?invite=, encode it in the OAuth state
    // so it survives the Google redirect roundtrip
    const inviteToken = req.query.invite;
    let state: string | undefined;
    if (typeof inviteToken === "string" && inviteToken.length > 0) {
      state = Buffer.from(JSON.stringify({ invite: inviteToken })).toString("base64");
    }
    const url = buildGoogleAuthUrl(state);
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

      // 4a. Decode optional invite token from OAuth state
      let inviteToken: string | undefined;
      if (req.query.state && typeof req.query.state === "string") {
        try {
          const decoded = JSON.parse(
            Buffer.from(req.query.state, "base64").toString(),
          ) as { invite?: string };
          inviteToken = decoded.invite;
        } catch {
          // Malformed state — ignore, fall through to normal flow
        }
      }

      // 4b. Upsert user — find by email, or create with a new firm (or join via invite)
      let user = await prisma.user.findUnique({
        where: { email: profile.email },
        include: { firm: true },
      });

      if (!user) {
        // ── Invite flow: join existing firm ──
        if (inviteToken) {
          const invite = await prisma.firmInvite.findUnique({
            where: { token: inviteToken },
            include: { firm: true },
          });

          if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
            return res.redirect(`${frontendUrl}/auth/error?reason=invite_invalid`);
          }
          if (invite.email && invite.email !== profile.email) {
            return res.redirect(`${frontendUrl}/auth/error?reason=invite_email_mismatch`);
          }

          // Create the user under the invited firm
          const newUser = await prisma.user.create({
            data: {
              firmId: invite.firmId,
              email: profile.email,
              name: profile.name,
              role: invite.role,
              googleRefreshTokenEnc: Buffer.from(encryptedRefreshToken),
            },
          });

          // Mark invite as consumed
          await prisma.firmInvite.update({
            where: { id: invite.id },
            data: { usedBy: newUser.id, usedAt: new Date() },
          });

          user = await prisma.user.findUnique({
            where: { id: newUser.id },
            include: { firm: true },
          });

          if (!user) throw new Error("Failed to fetch user after invite acceptance");

          logger.authEvent({
            userId: newUser.id,
            firmId: invite.firmId,
            event: "invite_accepted",
            ipAddress: req.ip,
          });
        } else {
          // ── Normal flow: create a new firm ──
          const slug = profile.email
            .split("@")[0]
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-");
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
          void newFirm; // used for side effect

          user = await prisma.user.findUnique({
            where: { email: profile.email },
            include: { firm: true },
          });

          if (!user) throw new Error("Failed to create user after firm creation");
        }
      } else {
        // Returning user

        // Check if they're accepting an invite to join a different firm
        if (inviteToken) {
          const invite = await prisma.firmInvite.findUnique({
            where: { token: inviteToken },
            include: { firm: true },
          });

          if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
            return res.redirect(`${frontendUrl}/auth/error?reason=invite_invalid`);
          }
          if (invite.email && invite.email !== profile.email) {
            return res.redirect(`${frontendUrl}/auth/error?reason=invite_email_mismatch`);
          }

          // If user already belongs to this firm, just update tokens and mark invite as used
          if (user.firmId === invite.firmId) {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                googleRefreshTokenEnc: Buffer.from(encryptedRefreshToken),
                lastSyncAt: null,
                // Don't change role - they're already in this firm
              },
            });

            // Mark invite as consumed
            await prisma.firmInvite.update({
              where: { id: invite.id },
              data: { usedBy: user.id, usedAt: new Date() },
            });
          } else {
            // User belongs to a different firm - create new user in invited firm
            const newUser = await prisma.user.create({
              data: {
                firmId: invite.firmId,
                email: profile.email,
                name: profile.name,
                role: invite.role,
                googleRefreshTokenEnc: Buffer.from(encryptedRefreshToken),
              },
            });

            // Mark invite as consumed
            await prisma.firmInvite.update({
              where: { id: invite.id },
              data: { usedBy: newUser.id, usedAt: new Date() },
            });

            // Update user reference to the new user
            user = await prisma.user.findUnique({
              where: { id: newUser.id },
              include: { firm: true },
            });

            if (!user) throw new Error("Failed to fetch user after invite acceptance");

            logger.authEvent({
              userId: newUser.id,
              firmId: invite.firmId,
              event: "invite_accepted",
              ipAddress: req.ip,
            });
          }
        } else {
          // Normal returning user — just update their refresh token
          await prisma.user.update({
            where: { id: user.id },
            data: {
              googleRefreshTokenEnc: Buffer.from(encryptedRefreshToken),
              lastSyncAt: null,
            },
          });
        }
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

      // Log successful authentication
      logger.authEvent({
        userId: user.id,
        firmId: user.firmId,
        event: "login",
        ipAddress: req.ip,
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

  // Log logout event
  logger.authEvent({
    userId: req.user?.userId,
    firmId: req.user?.firmId,
    event: "logout",
    ipAddress: req.ip,
  });

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
