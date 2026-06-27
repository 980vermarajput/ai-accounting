/**
 * WhatsApp Webhook Handler (AiSensy)
 *
 * Phase 0 scope: account LINKING + NOTIFICATIONS only. We do NOT port the
 * Telegram command bot (/ask, /clients, …) — Phase 1 rebuilds inbound around
 * notice-forwarding, and the inbound media hook below is exactly where a
 * forwarded notice (PDF/image) will be picked up.
 *
 * Inbound flow:
 *   - "/link <CODE>" or a bare 6-char code → consume the Redis link code, create
 *     a WhatsAppLink mapping waId → userId/firmId, confirm.
 *   - any other message from a linked user → acknowledge (notice ingestion lands
 *     here in Phase 1).
 */

import type { Request, Response } from "express";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { getRedis } from "../lib/redis";
import { logger } from "../lib/logger";
import {
  sendMessage,
  parseInbound,
  verifyWebhookSecret,
  consumeLinkCode,
} from "../lib/whatsapp";

export const whatsappRouter: Router = Router();

const RATE_LIMIT_MAX = 20; // messages per hour per sender
const RATE_LIMIT_WINDOW = 3600;
const LINK_CODE_RE = /\b([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6})\b/;

// ─── Rate limiting (mirrors telegram webhook) ────────

async function checkRateLimit(waId: string): Promise<boolean> {
  const redis = getRedis();
  const key = `whatsapp:ratelimit:${waId}`;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW);
  }
  return current <= RATE_LIMIT_MAX;
}

// ─── Linking ─────────────────────────────────────────

async function handleLink(waId: string, waName: string | undefined, code: string) {
  const claim = await consumeLinkCode(code);
  if (!claim) {
    await sendMessage(
      waId,
      "That link code is invalid or expired. Generate a fresh one from Settings → WhatsApp in the app.",
      waName,
    );
    return;
  }

  // Upsert: re-linking the same user updates their waId.
  await prisma.whatsAppLink.upsert({
    where: { userId: claim.userId },
    update: { waId, waName: waName ?? null, isActive: true, firmId: claim.firmId },
    create: {
      firmId: claim.firmId,
      userId: claim.userId,
      waId,
      waName: waName ?? null,
      alertsEnabled: true,
    },
  });

  logger.info("WhatsApp account linked", {
    event: "whatsapp_link",
    userId: claim.userId,
    firmId: claim.firmId,
  });

  await sendMessage(
    waId,
    "✅ You're linked. You'll get compliance alerts and your daily briefing here. Soon you'll be able to forward a government notice to this number and get a law-backed reply drafted.",
    waName,
  );
}

// ─── Webhook ─────────────────────────────────────────

whatsappRouter.post("/", async (req: Request, res: Response) => {
  // Acknowledge fast — providers retry on non-2xx.
  const secret =
    (req.headers["x-webhook-secret"] as string | undefined) ||
    (req.query.secret as string | undefined);
  if (!verifyWebhookSecret(secret)) {
    res.status(403).json({ success: false });
    return;
  }
  res.status(200).json({ success: true });

  try {
    const inbound = parseInbound(req.body);
    if (!inbound?.waId) return;

    if (!(await checkRateLimit(inbound.waId))) {
      logger.warn("WhatsApp inbound rate limited", { waId: inbound.waId });
      return;
    }

    const text = (inbound.text ?? "").trim();

    // Linking: explicit "/link CODE" or a bare 6-char code.
    const codeMatch =
      text.toLowerCase().startsWith("/link") || /^[A-Za-z0-9]{6}$/.test(text)
        ? text.toUpperCase().match(LINK_CODE_RE)
        : null;
    if (codeMatch) {
      await handleLink(inbound.waId, inbound.waName, codeMatch[1]);
      return;
    }

    const link = await prisma.whatsAppLink.findUnique({
      where: { waId: inbound.waId },
    });

    if (!link || !link.isActive) {
      await sendMessage(
        inbound.waId,
        "Hi! To connect your firm, open the app → Settings → WhatsApp, generate a link code, and send it here.",
        inbound.waName,
      );
      return;
    }

    // Linked user. Phase 1: a forwarded notice (inbound.media) is handled here.
    if (inbound.media) {
      await sendMessage(
        inbound.waId,
        "Got your document. Notice handling is coming soon — we'll explain it and draft a reply.",
        inbound.waName,
      );
      return;
    }

    await sendMessage(
      inbound.waId,
      "You're connected. Forwarding notices and chat are coming soon — for now you'll receive alerts and your daily briefing here.",
      inbound.waName,
    );
  } catch (err) {
    logger.error("WhatsApp webhook processing failed", {
      error: (err as Error).message,
    });
  }
});
