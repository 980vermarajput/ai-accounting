/**
 * Telegram Bot Webhook Handler
 *
 * Handles incoming updates from Telegram Bot API.
 * Supports commands for RAG queries, alerts, and account management.
 *
 * Commands:
 *   /start       - Welcome message + linking instructions
 *   /link <code> - Link Telegram account to firm
 *   /help        - Show available commands
 *   /ask <query> - RAG query across all firm data
 *   /clients     - List firm's clients (paginated)
 *   /alerts      - Show unread HIGH/CRITICAL alerts
 *   /summary <client> - Get client summary
 *   /unlink      - Unlink Telegram account
 */

import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { getRedis } from "../lib/redis";
import { logger } from "../lib/logger";
import {
  sendMessage,
  sendChatAction,
  answerCallbackQuery,
  parseCommand,
  verifyWebhookSecret,
  truncateMessage,
  formatList,
  createInlineKeyboard,
  escapeHtml,
  type TelegramUpdate,
  type TelegramMessage,
  type InlineKeyboardButton,
} from "../lib/telegram";
import { generateRagAnswer, searchChunks } from "../lib/rag";

export const telegramRouter: Router = Router();

// ─── Constants ───────────────────────────────────────

const RATE_LIMIT_MAX = 20; // messages per hour
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds
const LINK_CODE_TTL = 600; // 10 minutes
const LINK_CODE_LENGTH = 6;

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "aica_firm_bot";

// ─── Rate Limiting ───────────────────────────────────

async function checkRateLimit(chatId: number): Promise<boolean> {
  const redis = getRedis();
  const key = `telegram:ratelimit:${chatId}`;

  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW);
  }

  return current <= RATE_LIMIT_MAX;
}

async function getRateLimitRemaining(chatId: number): Promise<number> {
  const redis = getRedis();
  const key = `telegram:ratelimit:${chatId}`;
  const current = await redis.get(key);
  return Math.max(0, RATE_LIMIT_MAX - parseInt(current || "0", 10));
}

// ─── Link Code Management ────────────────────────────

function generateLinkCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars
  let code = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function storeLinkCode(
  code: string,
  firmId: string,
  userId: string,
): Promise<void> {
  const redis = getRedis();
  const key = `telegram:link:${code}`;
  await redis.setex(
    key,
    LINK_CODE_TTL,
    JSON.stringify({ firmId, userId, createdAt: new Date().toISOString() }),
  );
}

async function consumeLinkCode(
  code: string,
): Promise<{ firmId: string; userId: string } | null> {
  const redis = getRedis();
  const key = `telegram:link:${code.toUpperCase()}`;

  const data = await redis.get(key);
  if (!data) return null;

  // Delete the code after retrieving (single use)
  await redis.del(key);

  return JSON.parse(data) as { firmId: string; userId: string };
}

// ─── User Lookup ─────────────────────────────────────

async function getTelegramLink(chatId: number) {
  return prisma.telegramLink.findUnique({
    where: { telegramChatId: BigInt(chatId) },
    include: {
      user: { select: { id: true, name: true, email: true } },
      firm: { select: { id: true, name: true } },
    },
  });
}

// ─── Command Handlers ────────────────────────────────

async function handleStart(chatId: number, username?: string): Promise<void> {
  const link = await getTelegramLink(chatId);

  if (link) {
    await sendMessage(
      chatId,
      `👋 Welcome back, <b>${escapeHtml(link.user.name)}</b>!\n\n` +
        `You're connected to <b>${escapeHtml(link.firm.name)}</b>.\n\n` +
        `Use /help to see available commands.`,
      { parseMode: "HTML" },
    );
    return;
  }

  await sendMessage(
    chatId,
    `👋 Welcome to <b>AI CA Assistant</b>!\n\n` +
      `I can help you query your firm's data, check alerts, and stay updated on client activity.\n\n` +
      `<b>To get started:</b>\n` +
      `1. Log into your AI CA Assistant web app\n` +
      `2. Go to Settings → Telegram\n` +
      `3. Click "Generate Link Code"\n` +
      `4. Send me: <code>/link YOUR_CODE</code>\n\n` +
      `Once linked, you'll have full access to your firm's AI assistant!`,
    { parseMode: "HTML" },
  );
}

async function handleHelp(chatId: number): Promise<void> {
  const link = await getTelegramLink(chatId);

  if (!link) {
    await sendMessage(
      chatId,
      `❓ <b>Available Commands</b>\n\n` +
        `/start - Get started\n` +
        `/link &lt;code&gt; - Link your firm account\n` +
        `/help - Show this message\n\n` +
        `<i>Link your account first to access all features!</i>`,
      { parseMode: "HTML" },
    );
    return;
  }

  await sendMessage(
    chatId,
    `❓ <b>Available Commands</b>\n\n` +
      `<b>Query &amp; Search</b>\n` +
      `/ask &lt;question&gt; - Ask anything about your firm data\n` +
      `/summary &lt;client&gt; - Get a client summary\n\n` +
      `<b>Lists &amp; Alerts</b>\n` +
      `/clients - List your clients\n` +
      `/alerts - View unread alerts\n\n` +
      `<b>Account</b>\n` +
      `/unlink - Disconnect Telegram\n` +
      `/help - Show this message\n\n` +
      `<i>You can also just type a question without /ask!</i>`,
    { parseMode: "HTML" },
  );
}

async function handleLink(
  chatId: number,
  code: string,
  username?: string,
): Promise<void> {
  if (!code) {
    await sendMessage(
      chatId,
      `❌ Please provide your link code.\n\nUsage: <code>/link YOUR_CODE</code>`,
      { parseMode: "HTML" },
    );
    return;
  }

  // Check if already linked
  const existingLink = await getTelegramLink(chatId);
  if (existingLink) {
    await sendMessage(
      chatId,
      `⚠️ This Telegram account is already linked to <b>${escapeHtml(existingLink.firm.name)}</b>.\n\n` +
        `Use /unlink first if you want to link to a different account.`,
      { parseMode: "HTML" },
    );
    return;
  }

  // Validate and consume the link code
  const linkData = await consumeLinkCode(code);
  if (!linkData) {
    await sendMessage(
      chatId,
      `❌ Invalid or expired link code.\n\n` +
        `Please generate a new code from the web app:\n` +
        `Settings → Telegram → Generate Link Code`,
      { parseMode: "HTML" },
    );
    return;
  }

  // Check if user already has a telegram link
  const userHasLink = await prisma.telegramLink.findUnique({
    where: { userId: linkData.userId },
  });

  if (userHasLink) {
    await sendMessage(
      chatId,
      `⚠️ This web account is already linked to another Telegram account.\n\n` +
        `Please unlink from the web app first, then try again.`,
      { parseMode: "HTML" },
    );
    return;
  }

  // Create the link
  try {
    await prisma.telegramLink.create({
      data: {
        firmId: linkData.firmId,
        userId: linkData.userId,
        telegramChatId: BigInt(chatId),
        telegramUsername: username || null,
        alertsEnabled: true, // Enable by default
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: linkData.userId },
      include: { firm: true },
    });

    await sendMessage(
      chatId,
      `✅ <b>Account Linked Successfully!</b>\n\n` +
        `Welcome, <b>${escapeHtml(user?.name || "User")}</b>!\n` +
        `Connected to: <b>${escapeHtml(user?.firm?.name || "Your Firm")}</b>\n\n` +
        `You'll now receive alert notifications here.\n` +
        `Type /help to see available commands.`,
      { parseMode: "HTML" },
    );

    logger.info("Telegram account linked", {
      event: "telegram_link",
      userId: linkData.userId,
      firmId: linkData.firmId,
      telegramChatId: chatId,
    });
  } catch (error) {
    logger.error("Failed to create Telegram link", {
      error: error instanceof Error ? error.message : "Unknown error",
      chatId,
    });
    await sendMessage(chatId, `❌ Failed to link account. Please try again later.`, {
      parseMode: "HTML",
    });
  }
}

async function handleUnlink(chatId: number): Promise<void> {
  const link = await getTelegramLink(chatId);

  if (!link) {
    await sendMessage(chatId, `⚠️ This Telegram account is not linked to any firm.`);
    return;
  }

  // Confirm with button
  await sendMessage(
    chatId,
    `⚠️ <b>Unlink Account?</b>\n\n` +
      `This will disconnect your Telegram from <b>${escapeHtml(link.firm.name)}</b>.\n\n` +
      `You won't receive alerts here anymore.`,
    {
      parseMode: "HTML",
      replyMarkup: createInlineKeyboard([
        [
          { text: "✅ Yes, Unlink", callback_data: "unlink_confirm" },
          { text: "❌ Cancel", callback_data: "unlink_cancel" },
        ],
      ]),
    },
  );
}

async function handleAsk(
  chatId: number,
  query: string,
  firmId: string,
  userId: string,
): Promise<void> {
  if (!query.trim()) {
    await sendMessage(
      chatId,
      `❓ What would you like to know?\n\nUsage: <code>/ask your question here</code>`,
      { parseMode: "HTML" },
    );
    return;
  }

  // Send typing indicator
  await sendChatAction(chatId, "typing");

  try {
    // Search for relevant chunks
    const chunks = await searchChunks(query, firmId, { limit: 6 });

    // Generate answer
    const answer = await generateRagAnswer(query, chunks, firmId);

    // Format response
    let response = answer.answer;

    if (chunks.length > 0) {
      response += `\n\n📎 <i>${chunks.length} source${chunks.length > 1 ? "s" : ""} cited</i>`;
    }

    await sendMessage(chatId, truncateMessage(response), { parseMode: "HTML" });

    // Log the query
    logger.info("Telegram RAG query", {
      event: "telegram_query",
      firmId,
      userId,
      queryLength: query.length,
      chunksFound: chunks.length,
    });
  } catch (error) {
    logger.error("Telegram RAG query failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      firmId,
    });
    await sendMessage(
      chatId,
      `❌ Sorry, I couldn't process your question. Please try again later.`,
    );
  }
}

async function handleClients(chatId: number, firmId: string, page = 0): Promise<void> {
  const pageSize = 10;

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where: { firmId },
      orderBy: { name: "asc" },
      take: pageSize,
      skip: page * pageSize,
      select: {
        id: true,
        name: true,
        identifier: true,
        _count: { select: { documents: true } },
      },
    }),
    prisma.client.count({ where: { firmId } }),
  ]);

  if (clients.length === 0 && page === 0) {
    await sendMessage(chatId, `📋 No clients found in your firm yet.`);
    return;
  }

  const clientLines = clients.map(
    (c, i) =>
      `${page * pageSize + i + 1}. <b>${escapeHtml(c.name)}</b> (${c.identifier})\n   📄 ${c._count.documents} documents`,
  );

  const totalPages = Math.ceil(total / pageSize);
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  // Build pagination buttons
  const buttons: InlineKeyboardButton[] = [];
  if (hasPrev)
    buttons.push({ text: "◀️ Previous", callback_data: `clients_${page - 1}` });
  if (hasNext) buttons.push({ text: "Next ▶️", callback_data: `clients_${page + 1}` });

  await sendMessage(
    chatId,
    `📋 <b>Your Clients</b> (${total} total)\n\n${clientLines.join("\n\n")}` +
      `\n\n<i>Page ${page + 1} of ${totalPages}</i>`,
    {
      parseMode: "HTML",
      replyMarkup: buttons.length > 0 ? createInlineKeyboard([buttons]) : undefined,
    },
  );
}

async function handleAlerts(chatId: number, firmId: string): Promise<void> {
  const alerts = await prisma.alert.findMany({
    where: {
      firmId,
      isRead: false,
      severity: { in: ["HIGH", "CRITICAL"] },
      resolvedAt: null,
    },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: 10,
    include: {
      client: { select: { name: true } },
    },
  });

  if (alerts.length === 0) {
    await sendMessage(
      chatId,
      `✅ <b>No unread alerts!</b>\n\nYour firm is all caught up.`,
      { parseMode: "HTML" },
    );
    return;
  }

  const severityEmoji: Record<string, string> = {
    CRITICAL: "🔴",
    HIGH: "🟠",
    MEDIUM: "🟡",
    LOW: "🟢",
  };

  const alertLines = alerts.map((a) => {
    const emoji = severityEmoji[a.severity] || "⚪";
    const client = a.client ? ` (${escapeHtml(a.client.name)})` : "";
    return `${emoji} <b>${escapeHtml(a.title)}</b>${client}\n${escapeHtml(truncateMessage(a.body, 100))}`;
  });

  await sendMessage(
    chatId,
    `⚠️ <b>Unread Alerts</b> (${alerts.length})\n\n${alertLines.join("\n\n")}`,
    { parseMode: "HTML" },
  );
}

async function handleSummary(
  chatId: number,
  clientName: string,
  firmId: string,
): Promise<void> {
  if (!clientName.trim()) {
    await sendMessage(
      chatId,
      `❓ Which client?\n\nUsage: <code>/summary client name</code>`,
      { parseMode: "HTML" },
    );
    return;
  }

  await sendChatAction(chatId, "typing");

  // Find client by name (fuzzy match)
  const client = await prisma.client.findFirst({
    where: {
      firmId,
      name: { contains: clientName.trim(), mode: "insensitive" },
    },
    include: {
      _count: { select: { documents: true, alerts: true } },
      documents: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, filename: true },
      },
      alerts: {
        where: { isRead: false, resolvedAt: null },
        select: { severity: true },
      },
    },
  });

  if (!client) {
    await sendMessage(
      chatId,
      `❌ Client "<b>${escapeHtml(clientName)}</b>" not found.\n\nCheck /clients for available clients.`,
      { parseMode: "HTML" },
    );
    return;
  }

  const lastDoc = client.documents[0];
  const daysSinceLastDoc = lastDoc
    ? Math.floor(
        (Date.now() - new Date(lastDoc.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      )
    : null;

  const unreadAlerts = client.alerts.length;
  const criticalAlerts = client.alerts.filter((a) => a.severity === "CRITICAL").length;

  let statusEmoji = "✅";
  if (criticalAlerts > 0) statusEmoji = "🔴";
  else if (unreadAlerts > 0) statusEmoji = "🟠";
  else if (daysSinceLastDoc && daysSinceLastDoc > 30) statusEmoji = "🟡";

  await sendMessage(
    chatId,
    `${statusEmoji} <b>${escapeHtml(client.name)}</b>\n\n` +
      `📋 ID: ${client.identifier}\n` +
      `📄 Documents: ${client._count.documents}\n` +
      `⚠️ Unread Alerts: ${unreadAlerts}${criticalAlerts > 0 ? ` (${criticalAlerts} critical)` : ""}\n` +
      `📅 Last Activity: ${lastDoc ? `${daysSinceLastDoc} days ago` : "No documents yet"}\n` +
      (lastDoc ? `📎 Latest: ${escapeHtml(lastDoc.filename)}` : ""),
    { parseMode: "HTML" },
  );
}

// ─── Callback Query Handler ──────────────────────────

async function handleCallbackQuery(
  queryId: string,
  chatId: number,
  data: string,
  messageId?: number,
): Promise<void> {
  const link = await getTelegramLink(chatId);

  if (data === "unlink_confirm") {
    if (link) {
      await prisma.telegramLink.delete({
        where: { telegramChatId: BigInt(chatId) },
      });
      logger.info("Telegram account unlinked", {
        event: "telegram_unlink",
        userId: link.userId,
        firmId: link.firmId,
      });
    }
    await answerCallbackQuery(queryId, { text: "Account unlinked" });
    await sendMessage(
      chatId,
      `✅ Account unlinked successfully.\n\nYou can link again anytime with /link.`,
    );
    return;
  }

  if (data === "unlink_cancel") {
    await answerCallbackQuery(queryId, { text: "Cancelled" });
    await sendMessage(chatId, `👍 Unlink cancelled. Your account remains connected.`);
    return;
  }

  // Handle pagination callbacks
  if (data.startsWith("clients_") && link) {
    const page = parseInt(data.replace("clients_", ""), 10);
    await answerCallbackQuery(queryId);
    await handleClients(chatId, link.firmId, page);
    return;
  }

  await answerCallbackQuery(queryId, { text: "Unknown action" });
}

// ─── Main Message Handler ────────────────────────────

async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text || "";
  const username = message.from?.username;

  // Parse command if present
  const cmd = parseCommand(text);

  if (cmd) {
    switch (cmd.command) {
      case "start":
        await handleStart(chatId, username);
        return;

      case "help":
        await handleHelp(chatId);
        return;

      case "link":
        await handleLink(chatId, cmd.args, username);
        return;

      case "unlink":
        await handleUnlink(chatId);
        return;
    }

    // Commands below require linked account
    const link = await getTelegramLink(chatId);
    if (!link) {
      await sendMessage(
        chatId,
        `⚠️ Please link your account first.\n\nUse /start to see instructions.`,
      );
      return;
    }

    switch (cmd.command) {
      case "ask":
        await handleAsk(chatId, cmd.args, link.firmId, link.userId);
        return;

      case "clients":
        await handleClients(chatId, link.firmId);
        return;

      case "alerts":
        await handleAlerts(chatId, link.firmId);
        return;

      case "summary":
        await handleSummary(chatId, cmd.args, link.firmId);
        return;

      default:
        await sendMessage(
          chatId,
          `❓ Unknown command. Use /help to see available commands.`,
        );
        return;
    }
  }

  // No command — treat as RAG query if linked
  const link = await getTelegramLink(chatId);
  if (link && text.trim()) {
    await handleAsk(chatId, text, link.firmId, link.userId);
    return;
  }

  // Not linked and no command
  if (!link) {
    await sendMessage(
      chatId,
      `👋 Hi! I'm the AI CA Assistant bot.\n\nUse /start to get started.`,
    );
  }
}

// ─── Webhook Endpoint ────────────────────────────────

telegramRouter.post("/", async (req: Request, res: Response) => {
  // Verify webhook secret
  const secretToken = req.headers["x-telegram-bot-api-secret-token"] as
    | string
    | undefined;
  if (!verifyWebhookSecret(secretToken)) {
    logger.warn("Telegram webhook: invalid secret token");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const update = req.body as TelegramUpdate;

  // Always respond 200 quickly to avoid Telegram retries
  res.status(200).json({ ok: true });

  try {
    // Handle callback queries (button clicks)
    if (update.callback_query) {
      const { id, from, message, data } = update.callback_query;
      const chatId = message?.chat.id || from.id;

      // Rate limit check
      if (!(await checkRateLimit(chatId))) {
        await answerCallbackQuery(id, {
          text: "Rate limit exceeded. Please wait.",
          showAlert: true,
        });
        return;
      }

      await handleCallbackQuery(id, chatId, data || "", message?.message_id);
      return;
    }

    // Handle messages
    if (update.message) {
      const chatId = update.message.chat.id;

      // Rate limit check
      if (!(await checkRateLimit(chatId))) {
        const remaining = await getRateLimitRemaining(chatId);
        await sendMessage(
          chatId,
          `⏳ Rate limit reached. You can send ${RATE_LIMIT_MAX} messages per hour.\n\nPlease wait a bit before trying again.`,
        );
        return;
      }

      await handleMessage(update.message);
    }
  } catch (error) {
    logger.error("Telegram webhook error", {
      error: error instanceof Error ? error.message : "Unknown error",
      updateId: update.update_id,
    });
  }
});

// ─── Export Link Code Generator ──────────────────────
// Used by settings API to generate codes for users

export { generateLinkCode, storeLinkCode, LINK_CODE_TTL };
