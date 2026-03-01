/**
 * Telegram Settings API Routes
 *
 * Manages Telegram integration settings for users.
 * Allows linking/unlinking accounts and managing notifications.
 */

import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";
import { generateLinkCode, storeLinkCode, LINK_CODE_TTL } from "./telegram";

export const telegramSettingsRouter: Router = Router();

// All routes require authentication
telegramSettingsRouter.use(requireAuth);

// ─── GET /api/settings/telegram/status ───────────────

telegramSettingsRouter.get(
  "/status",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;

      const link = await prisma.telegramLink.findUnique({
        where: { userId },
        select: {
          telegramChatId: true,
          telegramUsername: true,
          alertsEnabled: true,
          linkedAt: true,
          isActive: true,
        },
      });

      if (!link || !link.isActive) {
        res.json({
          success: true,
          data: {
            linked: false,
            alertsEnabled: false,
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          linked: true,
          telegramChatId: link.telegramChatId.toString(),
          telegramUsername: link.telegramUsername,
          alertsEnabled: link.alertsEnabled,
          linkedAt: link.linkedAt.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─── POST /api/settings/telegram/link-code ───────────

telegramSettingsRouter.post(
  "/link-code",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const firmId = req.user!.firmId;

      // Check if already linked
      const existingLink = await prisma.telegramLink.findUnique({
        where: { userId },
      });

      if (existingLink?.isActive) {
        res.status(400).json({
          success: false,
          error: {
            code: "ALREADY_LINKED",
            message:
              "Your account is already linked to Telegram. Unlink first to generate a new code.",
          },
        });
        return;
      }

      // Generate and store link code
      const code = generateLinkCode();
      await storeLinkCode(code, firmId, userId);

      logger.info("Telegram link code generated", {
        event: "telegram_link_code_generated",
        userId,
        firmId,
      });

      res.json({
        success: true,
        data: {
          code,
          expiresIn: LINK_CODE_TTL,
          botUsername: process.env.TELEGRAM_BOT_USERNAME || "aica_firm_bot",
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─── DELETE /api/settings/telegram/unlink ────────────

telegramSettingsRouter.delete(
  "/unlink",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;

      const link = await prisma.telegramLink.findUnique({
        where: { userId },
      });

      if (!link) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_LINKED",
            message: "Your account is not linked to Telegram.",
          },
        });
        return;
      }

      await prisma.telegramLink.delete({
        where: { userId },
      });

      logger.info("Telegram account unlinked via web", {
        event: "telegram_unlink_web",
        userId,
        firmId: link.firmId,
      });

      res.json({
        success: true,
        data: { unlinked: true },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /api/settings/telegram/notifications ──────

telegramSettingsRouter.patch(
  "/notifications",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { enabled } = req.body as { enabled?: boolean };

      if (typeof enabled !== "boolean") {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "enabled must be a boolean",
          },
        });
        return;
      }

      const link = await prisma.telegramLink.findUnique({
        where: { userId },
      });

      if (!link) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_LINKED",
            message: "Your account is not linked to Telegram.",
          },
        });
        return;
      }

      await prisma.telegramLink.update({
        where: { userId },
        data: { alertsEnabled: enabled },
      });

      logger.info("Telegram notifications updated", {
        event: "telegram_notifications_updated",
        userId,
        alertsEnabled: enabled,
      });

      res.json({
        success: true,
        data: { alertsEnabled: enabled },
      });
    } catch (error) {
      next(error);
    }
  },
);
