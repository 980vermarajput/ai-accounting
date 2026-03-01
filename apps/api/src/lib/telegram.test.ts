import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parseCommand,
  escapeMarkdownV2,
  escapeHtml,
  truncateMessage,
  formatList,
  createInlineKeyboard,
  verifyWebhookSecret,
  BOT_COMMANDS,
} from "./telegram";

// ─── parseCommand ────────────────────────────────────────────────────────────

describe("parseCommand", () => {
  it("parses a simple command without args", () => {
    const result = parseCommand("/start");
    expect(result).toEqual({ command: "start", args: "" });
  });

  it("parses a command with args", () => {
    const result = parseCommand("/ask what is GST?");
    expect(result).toEqual({ command: "ask", args: "what is GST?" });
  });

  it("parses a command with multiple args", () => {
    const result = parseCommand("/link ABC123");
    expect(result).toEqual({ command: "link", args: "ABC123" });
  });

  it("handles command with bot username", () => {
    const result = parseCommand("/start@aica_firm_bot");
    expect(result).toEqual({ command: "start", args: "" });
  });

  it("handles command with bot username and args", () => {
    const result = parseCommand("/ask@aica_firm_bot what is TDS?");
    expect(result).toEqual({ command: "ask", args: "what is TDS?" });
  });

  it("converts command to lowercase", () => {
    const result = parseCommand("/START");
    expect(result).toEqual({ command: "start", args: "" });
  });

  it("returns null for non-command text", () => {
    expect(parseCommand("hello")).toBeNull();
    expect(parseCommand("not a command")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });

  it("handles command with extra whitespace", () => {
    const result = parseCommand("/ask   multiple   spaces");
    expect(result).toEqual({ command: "ask", args: "multiple spaces" });
  });
});

// ─── escapeMarkdownV2 ────────────────────────────────────────────────────────

describe("escapeMarkdownV2", () => {
  it("escapes underscores", () => {
    expect(escapeMarkdownV2("hello_world")).toBe("hello\\_world");
  });

  it("escapes asterisks", () => {
    expect(escapeMarkdownV2("**bold**")).toBe("\\*\\*bold\\*\\*");
  });

  it("escapes square brackets", () => {
    expect(escapeMarkdownV2("[link]")).toBe("\\[link\\]");
  });

  it("escapes parentheses", () => {
    expect(escapeMarkdownV2("(url)")).toBe("\\(url\\)");
  });

  it("escapes tilde", () => {
    expect(escapeMarkdownV2("~strikethrough~")).toBe("\\~strikethrough\\~");
  });

  it("escapes backticks", () => {
    expect(escapeMarkdownV2("`code`")).toBe("\\`code\\`");
  });

  it("escapes multiple special chars", () => {
    expect(escapeMarkdownV2("*bold* _italic_ `code`")).toBe(
      "\\*bold\\* \\_italic\\_ \\`code\\`",
    );
  });

  it("leaves plain text unchanged", () => {
    expect(escapeMarkdownV2("hello world 123")).toBe("hello world 123");
  });

  it("escapes dots and exclamation marks", () => {
    expect(escapeMarkdownV2("Hello! How are you?")).toBe("Hello\\! How are you?");
    expect(escapeMarkdownV2("file.txt")).toBe("file\\.txt");
  });
});

// ─── escapeHtml ──────────────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("escapes less than signs", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes greater than signs", () => {
    expect(escapeHtml("1 > 0")).toBe("1 &gt; 0");
  });

  it("escapes all HTML special chars in combination", () => {
    expect(escapeHtml('<tag attr="value"> & text')).toBe(
      '&lt;tag attr="value"&gt; &amp; text',
    );
  });

  it("leaves plain text unchanged", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });
});

// ─── truncateMessage ─────────────────────────────────────────────────────────

describe("truncateMessage", () => {
  it("returns short text unchanged", () => {
    expect(truncateMessage("hello", 100)).toBe("hello");
  });

  it("truncates text exceeding max length", () => {
    const longText = "a".repeat(100);
    const result = truncateMessage(longText, 50);
    expect(result.length).toBe(50);
    expect(result.endsWith("...")).toBe(true);
  });

  it("uses default max length of 4000", () => {
    const exactlyMaxText = "a".repeat(4000);
    expect(truncateMessage(exactlyMaxText)).toBe(exactlyMaxText);

    const tooLongText = "a".repeat(4100);
    const result = truncateMessage(tooLongText);
    expect(result.length).toBe(4000);
    expect(result.endsWith("...")).toBe(true);
  });

  it("handles text at exact max length", () => {
    const exactText = "a".repeat(100);
    expect(truncateMessage(exactText, 100)).toBe(exactText);
  });

  it("handles empty string", () => {
    expect(truncateMessage("", 100)).toBe("");
  });
});

// ─── formatList ──────────────────────────────────────────────────────────────

describe("formatList", () => {
  it("formats list with default bullet", () => {
    const result = formatList(["item1", "item2", "item3"]);
    expect(result).toBe("• item1\n• item2\n• item3");
  });

  it("formats numbered list", () => {
    const result = formatList(["first", "second", "third"], { numbered: true });
    expect(result).toBe("1. first\n2. second\n3. third");
  });

  it("uses custom bullet", () => {
    const result = formatList(["a", "b"], { bullet: "→" });
    expect(result).toBe("→ a\n→ b");
  });

  it("handles empty list", () => {
    expect(formatList([])).toBe("");
  });

  it("handles single item", () => {
    expect(formatList(["only one"])).toBe("• only one");
  });
});

// ─── createInlineKeyboard ────────────────────────────────────────────────────

describe("createInlineKeyboard", () => {
  it("creates keyboard with single row", () => {
    const result = createInlineKeyboard([[{ text: "Button 1", callback_data: "btn1" }]]);
    expect(result).toEqual({
      inline_keyboard: [[{ text: "Button 1", callback_data: "btn1" }]],
    });
  });

  it("creates keyboard with multiple rows", () => {
    const result = createInlineKeyboard([
      [{ text: "Row 1", callback_data: "r1" }],
      [{ text: "Row 2", callback_data: "r2" }],
    ]);
    expect(result.inline_keyboard.length).toBe(2);
  });

  it("creates keyboard with multiple buttons per row", () => {
    const result = createInlineKeyboard([
      [
        { text: "Left", callback_data: "left" },
        { text: "Right", callback_data: "right" },
      ],
    ]);
    expect(result.inline_keyboard[0].length).toBe(2);
  });

  it("creates keyboard with URL button", () => {
    const result = createInlineKeyboard([
      [{ text: "Open Link", url: "https://example.com" }],
    ]);
    expect(result.inline_keyboard[0][0].url).toBe("https://example.com");
  });
});

// ─── verifyWebhookSecret ─────────────────────────────────────────────────────

describe("verifyWebhookSecret", () => {
  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret-123";
  });

  afterEach(() => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  it("returns true for matching secret", () => {
    expect(verifyWebhookSecret("test-secret-123")).toBe(true);
  });

  it("returns false for non-matching secret", () => {
    expect(verifyWebhookSecret("wrong-secret")).toBe(false);
  });

  it("returns false for undefined header", () => {
    expect(verifyWebhookSecret(undefined)).toBe(false);
  });

  it("returns true when no secret is configured (dev mode)", () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect(verifyWebhookSecret(undefined)).toBe(true);
    expect(verifyWebhookSecret("anything")).toBe(true);
  });

  it("is case-sensitive", () => {
    expect(verifyWebhookSecret("TEST-SECRET-123")).toBe(false);
  });
});

// ─── BOT_COMMANDS ────────────────────────────────────────────────────────────

describe("BOT_COMMANDS", () => {
  it("contains required commands", () => {
    const commandNames = BOT_COMMANDS.map((c) => c.command);
    expect(commandNames).toContain("start");
    expect(commandNames).toContain("help");
    expect(commandNames).toContain("link");
    expect(commandNames).toContain("unlink");
    expect(commandNames).toContain("ask");
    expect(commandNames).toContain("clients");
    expect(commandNames).toContain("alerts");
    expect(commandNames).toContain("summary");
  });

  it("all commands have descriptions", () => {
    for (const cmd of BOT_COMMANDS) {
      expect(cmd.description).toBeTruthy();
      expect(cmd.description.length).toBeGreaterThan(5);
    }
  });

  it("all commands are lowercase", () => {
    for (const cmd of BOT_COMMANDS) {
      expect(cmd.command).toBe(cmd.command.toLowerCase());
    }
  });
});
