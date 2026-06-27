/**
 * WhatsApp Business API Client — AiSensy
 *
 * Wraps AiSensy's Campaign API. AiSensy is a BSP layer over Meta's WhatsApp
 * Cloud API: every send maps to a "campaign", and each campaign is bound to a
 * Meta-approved message template. The exported interface mirrors `./telegram.ts`
 * and is provider-agnostic, so moving to Cloud API direct (or another BSP) later
 * is a change inside this file only — callers (routes, alert push) don't change.
 *
 * IMPORTANT — WhatsApp messaging rules (enforced by Meta, not AiSensy):
 *   - Proactive sends (alerts, briefings, reminders) MUST use an approved
 *     template → `sendTemplate` (an AiSensy campaign).
 *   - "Free-form" in-window replies (`sendMessage`) are implemented here as a
 *     single-parameter template campaign ({{1}} = the text), which is the
 *     compliant AiSensy way to send dynamic copy.
 *
 * @see https://wiki.aisensy.com/ (Campaign API v2)
 */

import { getRedis } from "./redis";
import { logger } from "./logger";

// ─── Types ───────────────────────────────────────────

export interface WhatsAppMedia {
  /** Provider media id/url — download is deferred to Phase 1 (notice ingestion). */
  id: string;
  mimeType?: string;
  filename?: string;
  kind: "image" | "document" | "audio" | "video" | "other";
}

/** Normalized inbound message, provider-independent. */
export interface ParsedInbound {
  /** WhatsApp id of the sender (phone number with country code, digits only). */
  waId: string;
  /** Display name from the contact profile, if present. */
  waName?: string;
  /** Text body, if the message was a text message. */
  text?: string;
  /** Attached media, if any (PDF/image forwards). Download deferred to Phase 1. */
  media?: WhatsAppMedia;
}

// ─── Configuration ───────────────────────────────────

const CAMPAIGN_ENDPOINT = "/campaign/t1/api/v2";

// Read at call time (not module load) so runtime env + tests work correctly.
const apiBase = () => process.env.AISENSY_API_BASE || "https://backend.aisensy.com";
const apiKey = () => process.env.AISENSY_API_KEY;

export const LINK_CODE_TTL = 600; // 10 minutes
const LINK_CODE_LENGTH = 6;

/** Display number users message to link / forward notices (shown in the UI). */
export const BUSINESS_NUMBER = process.env.WHATSAPP_BUSINESS_NUMBER || "";

/**
 * Whether the WhatsApp channel is configured. Callers (e.g. proactive push)
 * should no-op when this is false, mirroring the Telegram bot-token guard.
 */
export function isConfigured(): boolean {
  return Boolean(apiKey());
}

// ─── Core send (AiSensy Campaign API) ────────────────

/**
 * Send a campaign (= an approved template) to one destination.
 * `templateParams` fill the template body's {{1}}, {{2}}, … in order.
 */
async function sendCampaign(
  destination: string,
  campaignName: string,
  templateParams: string[],
  userName: string,
): Promise<void> {
  if (!isConfigured()) {
    throw new Error("WhatsApp is not configured (AISENSY_API_KEY)");
  }

  const response = await fetch(`${apiBase()}${CAMPAIGN_ENDPOINT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: apiKey(),
      campaignName,
      destination,
      userName,
      templateParams,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    logger.error("WhatsApp (AiSensy) API error", {
      status: response.status,
      campaignName,
      detail: detail.slice(0, 500),
    });
    throw new Error(`WhatsApp API error ${response.status}`);
  }
}

/**
 * Send a pre-approved template (AiSensy campaign) — the way to reach a user
 * proactively. `bodyParams` fill the template's positional body variables.
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  bodyParams: string[] = [],
  userName = "there",
): Promise<void> {
  return sendCampaign(to, templateName, bodyParams, userName);
}

/**
 * Send dynamic copy as a single-parameter template campaign ({{1}} = text).
 * Use for in-window replies (e.g. the link-confirmation message). Requires the
 * `WHATSAPP_TEMPLATE_SESSION` campaign to exist with one body variable.
 */
export async function sendMessage(
  to: string,
  text: string,
  userName = "there",
): Promise<void> {
  return sendCampaign(to, TEMPLATES.SESSION_REPLY, [truncateMessage(text)], userName);
}

// ─── Inbound parsing ─────────────────────────────────

/**
 * Normalize a provider webhook payload into a single `ParsedInbound`, or null
 * if it carries no user message (e.g. a delivery/status callback).
 *
 * Tolerant of both AiSensy's flat inbound shape and a raw Meta Cloud API
 * `entry[].changes[].value.messages[]` payload.
 */
export function parseInbound(payload: unknown): ParsedInbound | null {
  try {
    const p = payload as Record<string, any>;

    // 1) Raw Meta Cloud API shape (AiSensy can forward this through).
    const metaValue = p?.entry?.[0]?.changes?.[0]?.value;
    const metaMsg = metaValue?.messages?.[0];
    if (metaMsg) {
      return normalizeMetaMessage(metaMsg, metaValue?.contacts?.[0]?.profile?.name);
    }

    // 2) AiSensy flat inbound shape.
    const waId: string | undefined =
      p?.waId || p?.destination || p?.source || p?.from || p?.mobile;
    if (!waId) return null;

    const result: ParsedInbound = {
      waId: String(waId),
      waName: p?.senderName || p?.name || p?.profileName,
    };

    const type: string | undefined = p?.type || p?.message?.type;
    if (type === "text" || p?.text || p?.message?.text) {
      result.text =
        (typeof p?.text === "string" ? p.text : p?.text?.body) ||
        (typeof p?.message?.text === "string"
          ? p.message.text
          : p?.message?.text?.body) ||
        p?.message;
    } else if (p?.media || p?.message?.media || type === "document" || type === "image") {
      const media = p?.media || p?.message?.media || {};
      result.media = {
        id: media.id || media.url || "",
        mimeType: media.mimeType || media.mime_type,
        filename: media.filename,
        kind: type === "image" ? "image" : "document",
      };
    }

    return result;
  } catch (err) {
    logger.warn("Failed to parse WhatsApp inbound payload", {
      error: (err as Error).message,
    });
    return null;
  }
}

function normalizeMetaMessage(message: any, waName?: string): ParsedInbound {
  const result: ParsedInbound = { waId: String(message.from), waName };
  if (message.type === "text") {
    result.text = message.text?.body;
  } else if (message.type === "image") {
    result.media = {
      id: message.image?.id,
      mimeType: message.image?.mime_type,
      kind: "image",
    };
  } else if (message.type === "document") {
    result.media = {
      id: message.document?.id,
      mimeType: message.document?.mime_type,
      filename: message.document?.filename,
      kind: "document",
    };
  }
  return result;
}

// ─── Webhook verification ────────────────────────────

/**
 * Verify the inbound webhook against the configured shared secret. AiSensy lets
 * you attach a secret (query param or header) to the webhook URL; if no secret
 * is set, verification is skipped (logged — not recommended for production).
 */
export function verifyWebhookSecret(token: string | undefined): boolean {
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!expected) {
    logger.warn("WHATSAPP_WEBHOOK_SECRET not configured - skipping verification");
    return true;
  }
  return token === expected;
}

// ─── Link Code Management ────────────────────────────

export function generateLinkCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
  let code = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function storeLinkCode(
  code: string,
  firmId: string,
  userId: string,
): Promise<void> {
  const redis = getRedis();
  await redis.setex(
    `whatsapp:link:${code}`,
    LINK_CODE_TTL,
    JSON.stringify({ firmId, userId, createdAt: new Date().toISOString() }),
  );
}

export async function consumeLinkCode(
  code: string,
): Promise<{ firmId: string; userId: string } | null> {
  const redis = getRedis();
  const key = `whatsapp:link:${code.toUpperCase()}`;
  const data = await redis.get(key);
  if (!data) return null;
  await redis.del(key); // single use
  return JSON.parse(data) as { firmId: string; userId: string };
}

// ─── Helpers ─────────────────────────────────────────

/** WhatsApp body text limit is 4096 chars. */
export function truncateMessage(text: string, maxLength = 4000): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

// ─── Campaign / template names ───────────────────────
// Each must match an approved AiSensy campaign (bound to a Meta-approved
// template). Submit these for approval early — approval is the long-pole item.

export const TEMPLATES = {
  /** Proactive HIGH/CRITICAL compliance alert. Body params: [severity, title, body]. */
  COMPLIANCE_ALERT: process.env.WHATSAPP_TEMPLATE_ALERT || "compliance_alert",
  /** Daily briefing summary. Body params: [summary]. */
  DAILY_BRIEFING: process.env.WHATSAPP_TEMPLATE_BRIEFING || "daily_briefing",
  /** One-variable template for dynamic in-window replies. Body param: [text]. */
  SESSION_REPLY: process.env.WHATSAPP_TEMPLATE_SESSION || "session_reply",
} as const;
