import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Avoid a real Redis connection from the link-code helpers' import of ./redis.
vi.mock("./redis", () => ({
  getRedis: () => ({
    setex: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  }),
}));

import {
  parseInbound,
  verifyWebhookSecret,
  generateLinkCode,
  truncateMessage,
  sendTemplate,
  isConfigured,
  TEMPLATES,
} from "./whatsapp";

// ─── parseInbound ────────────────────────────────────────────────

describe("parseInbound", () => {
  it("normalizes a Meta-shaped text message", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: "Asha" }, wa_id: "919812345678" }],
                messages: [
                  { from: "919812345678", type: "text", text: { body: "/link AB12CD" } },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(parseInbound(payload)).toEqual({
      waId: "919812345678",
      waName: "Asha",
      text: "/link AB12CD",
    });
  });

  it("normalizes a Meta-shaped document (forwarded notice) message", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: "Asha" } }],
                messages: [
                  {
                    from: "919812345678",
                    type: "document",
                    document: {
                      id: "MEDIA_ID",
                      mime_type: "application/pdf",
                      filename: "ASMT-10.pdf",
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const parsed = parseInbound(payload);
    expect(parsed?.media).toEqual({
      id: "MEDIA_ID",
      mimeType: "application/pdf",
      filename: "ASMT-10.pdf",
      kind: "document",
    });
  });

  it("normalizes an AiSensy flat text shape", () => {
    const parsed = parseInbound({
      destination: "919812345678",
      senderName: "Asha",
      type: "text",
      text: "hello",
    });
    expect(parsed).toEqual({
      waId: "919812345678",
      waName: "Asha",
      text: "hello",
    });
  });

  it("returns null for a status/delivery callback with no message", () => {
    expect(parseInbound({ entry: [{ changes: [{ value: { statuses: [] } }] }] })).toBeNull();
    expect(parseInbound({})).toBeNull();
  });
});

// ─── verifyWebhookSecret ─────────────────────────────────────────

describe("verifyWebhookSecret", () => {
  afterEach(() => {
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
  });

  it("skips verification when no secret is configured", () => {
    expect(verifyWebhookSecret(undefined)).toBe(true);
  });

  it("accepts a matching token and rejects a mismatch", () => {
    process.env.WHATSAPP_WEBHOOK_SECRET = "s3cr3t";
    expect(verifyWebhookSecret("s3cr3t")).toBe(true);
    expect(verifyWebhookSecret("nope")).toBe(false);
  });
});

// ─── helpers ─────────────────────────────────────────────────────

describe("generateLinkCode", () => {
  it("returns a 6-char code from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateLinkCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });
});

describe("truncateMessage", () => {
  it("leaves short text untouched and truncates long text with an ellipsis", () => {
    expect(truncateMessage("hi", 10)).toBe("hi");
    const long = "x".repeat(50);
    const out = truncateMessage(long, 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith("...")).toBe(true);
  });
});

// ─── sendTemplate (AiSensy campaign API) ─────────────────────────

describe("sendTemplate", () => {
  beforeEach(() => {
    process.env.AISENSY_API_KEY = "test-jwt";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.AISENSY_API_KEY;
  });

  it("isConfigured reflects the API key presence", () => {
    expect(isConfigured()).toBe(true);
  });

  it("posts a campaign payload with apiKey, campaignName, destination and params", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await sendTemplate("919812345678", TEMPLATES.DAILY_BRIEFING, ["today's summary"], "Asha");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      apiKey: "test-jwt",
      campaignName: TEMPLATES.DAILY_BRIEFING,
      destination: "919812345678",
      userName: "Asha",
      templateParams: ["today's summary"],
    });
  });

  it("throws when the provider returns a non-2xx response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("bad", { status: 400 }),
    );
    await expect(
      sendTemplate("919812345678", TEMPLATES.COMPLIANCE_ALERT, ["HIGH", "t", "b"]),
    ).rejects.toThrow(/WhatsApp API error 400/);
  });
});
