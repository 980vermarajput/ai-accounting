import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import type { ApiResponse } from "@ai-accounting/shared";
import { createInviteSchema, updateMemberRoleSchema } from "@ai-accounting/shared";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { ApiError } from "../lib/api-error";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

export const teamRouter: Router = Router();

// ─── Public: GET /api/team/invites/preview/:token — no auth needed ──────────
// Must be defined BEFORE the requireAuth middleware to avoid authentication
teamRouter.get(
  "/invites/preview/:token",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = String(req.params.token);

      type InviteWithRelations = Awaited<
        ReturnType<typeof prisma.firmInvite.findUnique>
      > & {
        firm: { name: string };
        creator: { name: string };
      };

      const invite = (await prisma.firmInvite.findUnique({
        where: { token },
        include: {
          firm: { select: { name: true } },
          creator: { select: { name: true } },
        },
      })) as InviteWithRelations | null;

      if (!invite) {
        return next(ApiError.notFound("Invite not found or has expired"));
      }

      if (invite.usedAt) {
        return next(ApiError.gone("This invite has already been used"));
      }

      if (invite.expiresAt < new Date()) {
        return next(ApiError.gone("This invite has expired"));
      }

      const response: ApiResponse = {
        success: true,
        data: {
          firmName: invite.firm.name,
          inviterName: invite.creator.name,
          role: invite.role,
          expiresAt: invite.expiresAt.toISOString(),
          // Include pre-filled email if set (so the join page can warn about mismatches)
          email: invite.email ?? null,
        },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// All team routes require authentication
teamRouter.use(requireAuth);

// ─── GET /api/team/members — list all users in the firm ─────────
teamRouter.get("/members", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const members = await prisma.user.findMany({
      where: { firmId: req.user!.firmId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        lastSyncAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const response: ApiResponse = { success: true, data: members };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

// All routes below require admin role
teamRouter.use(requireAdmin);

// ─── POST /api/team/invites — create a new invite ──────────────
teamRouter.post(
  "/invites",
  validate(createInviteSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, role } = req.body as { email?: string; role: "admin" | "member" };
      const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

      // Generate a cryptographically random 32-byte token (64 hex chars)
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const invite = await prisma.firmInvite.create({
        data: {
          firmId: req.user!.firmId,
          createdBy: req.user!.userId,
          token,
          email: email ?? null,
          role,
          expiresAt,
        },
      });

      const inviteUrl = `${frontendUrl}/join?token=${token}`;

      logger.info("Invite created", {
        firmId: req.user!.firmId,
        createdBy: req.user!.userId,
        inviteId: invite.id,
        targetEmail: email ?? "open",
        role,
      });

      const response: ApiResponse = {
        success: true,
        data: { invite, inviteUrl },
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/team/invites — list pending invites ──────────────
teamRouter.get("/invites", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invites = await prisma.firmInvite.findMany({
      where: {
        firmId: req.user!.firmId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const data = invites.map((inv) => ({
      ...inv,
      inviteUrl: `${frontendUrl}/join?token=${inv.token}`,
    }));

    const response: ApiResponse = { success: true, data };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/team/invites/:id — revoke an invite ───────────
teamRouter.delete(
  "/invites/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invite = await prisma.firmInvite.findFirst({
        where: { id: String(req.params.id), firmId: req.user!.firmId },
      });

      if (!invite) {
        return next(ApiError.notFound("Invite not found"));
      }

      if (invite.usedAt) {
        return next(
          ApiError.badRequest("Cannot revoke an invite that has already been used"),
        );
      }

      // "Revoke" by setting expiresAt to now — simpler than deleting
      await prisma.firmInvite.update({
        where: { id: invite.id },
        data: { expiresAt: new Date() },
      });

      const response: ApiResponse = {
        success: true,
        data: { message: "Invite revoked" },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /api/team/members/:userId/role — change a member's role ────────
teamRouter.patch(
  "/members/:userId/role",
  validate(updateMemberRoleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = String(req.params.userId);
      const { role } = req.body as { role: "admin" | "member" };

      // Can't change own role (to prevent accidentally locking yourself out)
      if (userId === req.user!.userId) {
        return next(ApiError.badRequest("You cannot change your own role"));
      }

      const member = await prisma.user.findFirst({
        where: { id: userId, firmId: req.user!.firmId },
      });

      if (!member) {
        return next(ApiError.notFound("Member not found in this firm"));
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { role },
        select: { id: true, email: true, name: true, role: true },
      });

      const response: ApiResponse = { success: true, data: updated };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /api/team/members/:userId — remove a member ────────
teamRouter.delete(
  "/members/:userId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = String(req.params.userId);

      // Can't remove yourself
      if (userId === req.user!.userId) {
        return next(ApiError.badRequest("You cannot remove yourself from the firm"));
      }

      const member = await prisma.user.findFirst({
        where: { id: userId, firmId: req.user!.firmId },
      });

      if (!member) {
        return next(ApiError.notFound("Member not found in this firm"));
      }

      await prisma.user.delete({ where: { id: userId } });

      logger.info("Member removed", {
        firmId: req.user!.firmId,
        removedBy: req.user!.userId,
        removedUserId: userId,
      });

      const response: ApiResponse = {
        success: true,
        data: { message: "Member removed" },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);
