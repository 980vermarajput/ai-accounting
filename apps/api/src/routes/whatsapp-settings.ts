/**
 * WhatsApp Settings API Routes
 *
 * Manages WhatsApp integration settings for users: link-code generation,
 * status, unlink, and notification toggle. Mirrors telegram-settings.ts.
 */

import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";
import {
  generateLinkCode,
  storeLinkCode,
  LINK_CODE_TTL,
  BUSINESS_NUMBER,
} from "../lib/whatsapp";

export const whatsappSettingsRouter: Router = Router();

whatsappSettingsRouter.use(requireAuth);

// ─── GET /api/settings/whatsapp/status ───────────────

whatsappSettingsRouter.get(
  "/status",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;

      const link = await prisma.whatsAppLink.findUnique({
        where: { userId },
        select: {
          waId: true,
          waName: true,
          alertsEnabled: true,
          linkedAt: true,
          isActive: true,
        },
      });

      if (!link || !link.isActive) {
        res.json({ success: true, data: { linked: false, alertsEnabled: false } });
        return;
      }

      res.json({
        success: true,
        data: {
          linked: true,
          waId: link.waId,
          waName: link.waName,
          alertsEnabled: link.alertsEnabled,
          linkedAt: link.linkedAt.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─── POST /api/settings/whatsapp/link-code ───────────

whatsappSettingsRouter.post(
  "/link-code",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const firmId = req.user!.firmId;

      const existingLink = await prisma.whatsAppLink.findUnique({ where: { userId } });
      if (existingLink?.isActive) {
        res.status(400).json({
          success: false,
          error: {
            code: "ALREADY_LINKED",
            message:
              "Your account is already linked to WhatsApp. Unlink first to generate a new code.",
          },
        });
        return;
      }

      const code = generateLinkCode();
      await storeLinkCode(code, firmId, userId);

      logger.info("WhatsApp link code generated", {
        event: "whatsapp_link_code_generated",
        userId,
        firmId,
      });

      res.json({
        success: true,
        data: { code, expiresIn: LINK_CODE_TTL, businessNumber: BUSINESS_NUMBER },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─── DELETE /api/settings/whatsapp/unlink ────────────

whatsappSettingsRouter.delete(
  "/unlink",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;

      const link = await prisma.whatsAppLink.findUnique({ where: { userId } });
      if (!link) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_LINKED",
            message: "Your account is not linked to WhatsApp.",
          },
        });
        return;
      }

      await prisma.whatsAppLink.delete({ where: { userId } });

      logger.info("WhatsApp account unlinked via web", {
        event: "whatsapp_unlink_web",
        userId,
        firmId: link.firmId,
      });

      res.json({ success: true, data: { unlinked: true } });
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /api/settings/whatsapp/notifications ──────

whatsappSettingsRouter.patch(
  "/notifications",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { enabled } = req.body as { enabled?: boolean };

      if (typeof enabled !== "boolean") {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "enabled must be a boolean" },
        });
        return;
      }

      const link = await prisma.whatsAppLink.findUnique({ where: { userId } });
      if (!link) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_LINKED",
            message: "Your account is not linked to WhatsApp.",
          },
        });
        return;
      }

      await prisma.whatsAppLink.update({
        where: { userId },
        data: { alertsEnabled: enabled },
      });

      logger.info("WhatsApp notifications updated", {
        event: "whatsapp_notifications_updated",
        userId,
        alertsEnabled: enabled,
      });

      res.json({ success: true, data: { alertsEnabled: enabled } });
    } catch (error) {
      next(error);
    }
  },
);
