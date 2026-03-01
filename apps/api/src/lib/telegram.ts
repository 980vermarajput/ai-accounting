/**
 * Telegram Bot API Client
 *
 * Provides a type-safe wrapper around the Telegram Bot API.
 * Uses fetch for HTTP requests to api.telegram.org.
 *
 * @see https://core.telegram.org/bots/api
 */

import { logger } from "./logger";

// ─── Types ───────────────────────────────────────────

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  entities?: TelegramMessageEntity[];
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  chat_instance: string;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface BotCommand {
  command: string;
  description: string;
}

export interface WebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

// ─── Configuration ───────────────────────────────────

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_BASE = "https://api.telegram.org";

function getApiUrl(method: string): string {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN environment variable is not set");
  }
  return `${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/${method}`;
}

// ─── API Methods ─────────────────────────────────────

/**
 * Generic API call wrapper with error handling
 */
async function callApi<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  const url = getApiUrl(method);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: params ? JSON.stringify(params) : undefined,
    });

    const data = (await response.json()) as TelegramApiResponse<T>;

    if (!data.ok) {
      logger.error("Telegram API error", {
        method,
        errorCode: data.error_code,
        description: data.description,
      });
      throw new Error(data.description || `Telegram API error: ${method}`);
    }

    return data.result as T;
  } catch (error) {
    logger.error("Telegram API request failed", {
      method,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Send a text message to a chat
 */
export async function sendMessage(
  chatId: number | string,
  text: string,
  options?: {
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
    replyMarkup?: InlineKeyboardMarkup;
    disableWebPagePreview?: boolean;
    replyToMessageId?: number;
  },
): Promise<TelegramMessage> {
  return callApi<TelegramMessage>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options?.parseMode,
    reply_markup: options?.replyMarkup,
    disable_web_page_preview: options?.disableWebPagePreview,
    reply_to_message_id: options?.replyToMessageId,
  });
}

/**
 * Send a "typing" action to indicate the bot is processing
 */
export async function sendChatAction(
  chatId: number | string,
  action: "typing" | "upload_document" = "typing",
): Promise<boolean> {
  return callApi<boolean>("sendChatAction", {
    chat_id: chatId,
    action,
  });
}

/**
 * Answer a callback query (button click)
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  options?: {
    text?: string;
    showAlert?: boolean;
    cacheTime?: number;
  },
): Promise<boolean> {
  return callApi<boolean>("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: options?.text,
    show_alert: options?.showAlert,
    cache_time: options?.cacheTime,
  });
}

/**
 * Edit an existing message's text
 */
export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  options?: {
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
    replyMarkup?: InlineKeyboardMarkup;
    disableWebPagePreview?: boolean;
  },
): Promise<TelegramMessage | boolean> {
  return callApi<TelegramMessage | boolean>("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: options?.parseMode,
    reply_markup: options?.replyMarkup,
    disable_web_page_preview: options?.disableWebPagePreview,
  });
}

/**
 * Set the bot's commands list (visible in menu)
 */
export async function setMyCommands(
  commands: BotCommand[],
  scope?: { type: string; chat_id?: number },
): Promise<boolean> {
  return callApi<boolean>("setMyCommands", {
    commands,
    scope,
  });
}

/**
 * Get current webhook info
 */
export async function getWebhookInfo(): Promise<WebhookInfo> {
  return callApi<WebhookInfo>("getWebhookInfo");
}

/**
 * Set the webhook URL for receiving updates
 */
export async function setWebhook(
  url: string,
  options?: {
    secretToken?: string;
    maxConnections?: number;
    allowedUpdates?: string[];
    dropPendingUpdates?: boolean;
  },
): Promise<boolean> {
  return callApi<boolean>("setWebhook", {
    url,
    secret_token: options?.secretToken,
    max_connections: options?.maxConnections,
    allowed_updates: options?.allowedUpdates,
    drop_pending_updates: options?.dropPendingUpdates,
  });
}

/**
 * Delete the webhook (switch back to getUpdates polling)
 */
export async function deleteWebhook(dropPendingUpdates?: boolean): Promise<boolean> {
  return callApi<boolean>("deleteWebhook", {
    drop_pending_updates: dropPendingUpdates,
  });
}

/**
 * Get basic info about the bot
 */
export async function getMe(): Promise<TelegramUser> {
  return callApi<TelegramUser>("getMe");
}

// ─── Helper Functions ────────────────────────────────

/**
 * Create an inline keyboard with buttons
 */
export function createInlineKeyboard(
  buttons: InlineKeyboardButton[][],
): InlineKeyboardMarkup {
  return { inline_keyboard: buttons };
}

/**
 * Parse a command from message text
 * Returns { command, args } or null if not a command
 */
export function parseCommand(text: string): {
  command: string;
  args: string;
} | null {
  if (!text.startsWith("/")) return null;

  const parts = text.split(/\s+/);
  const commandPart = parts[0];

  // Handle commands with bot username like /start@mybot
  const command = commandPart.split("@")[0].substring(1).toLowerCase();
  const args = parts.slice(1).join(" ");

  return { command, args };
}

/**
 * Escape special characters for MarkdownV2 format
 * @see https://core.telegram.org/bots/api#markdownv2-style
 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

/**
 * Escape special characters for HTML format
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Truncate text to fit Telegram's message limit (4096 chars)
 */
export function truncateMessage(text: string, maxLength = 4000): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Format a list of items for Telegram display
 */
export function formatList(
  items: string[],
  options?: { numbered?: boolean; bullet?: string },
): string {
  const bullet = options?.bullet || "•";
  return items
    .map((item, index) =>
      options?.numbered ? `${index + 1}. ${item}` : `${bullet} ${item}`,
    )
    .join("\n");
}

// ─── Bot Commands Definition ─────────────────────────

export const BOT_COMMANDS: BotCommand[] = [
  { command: "start", description: "Get started with AI CA Assistant" },
  { command: "link", description: "Link your firm account" },
  { command: "help", description: "Show available commands" },
  { command: "clients", description: "List your clients" },
  { command: "ask", description: "Ask anything about your firm data" },
  { command: "alerts", description: "View critical alerts" },
  { command: "summary", description: "Get client summary" },
  { command: "unlink", description: "Unlink your Telegram account" },
];

/**
 * Register bot commands with Telegram
 * Call this once during server startup
 */
export async function registerBotCommands(): Promise<void> {
  try {
    await setMyCommands(BOT_COMMANDS);
    logger.info("Telegram bot commands registered successfully");
  } catch (error) {
    logger.error("Failed to register Telegram bot commands", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// ─── Webhook Verification ────────────────────────────

/**
 * Verify the webhook secret token from request headers
 */
export function verifyWebhookSecret(headerToken: string | undefined): boolean {
  const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;

  // If no secret is configured, skip verification (not recommended for production)
  if (!expectedToken) {
    logger.warn("TELEGRAM_WEBHOOK_SECRET not configured - skipping verification");
    return true;
  }

  return headerToken === expectedToken;
}
