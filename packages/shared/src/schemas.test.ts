import { describe, it, expect } from "vitest";
import {
  googleCallbackSchema,
  chatRequestSchema,
  documentListQuerySchema,
  createClientSchema,
  inviteUserSchema,
  feedbackSchema,
  sendDraftSchema,
  syncRequestSchema,
} from "./schemas";

// ─── googleCallbackSchema ─────────────────────────────────────────────────────

describe("googleCallbackSchema", () => {
  it("accepts a valid authorization code", () => {
    const result = googleCallbackSchema.parse({ code: "4/0AX4XfWh-abc123" });
    expect(result.code).toBe("4/0AX4XfWh-abc123");
    expect(result.state).toBeUndefined();
  });

  it("accepts code + optional state", () => {
    const result = googleCallbackSchema.parse({
      code: "4/0AX4XfWh-abc123",
      state: "csrf-token-xyz",
    });
    expect(result.state).toBe("csrf-token-xyz");
  });

  it("rejects an empty code", () => {
    expect(() => googleCallbackSchema.parse({ code: "" })).toThrow();
  });

  it("rejects when code is missing", () => {
    expect(() => googleCallbackSchema.parse({})).toThrow();
  });

  it("rejects a non-string code", () => {
    expect(() => googleCallbackSchema.parse({ code: 123 })).toThrow();
  });
});

// ─── chatRequestSchema ────────────────────────────────────────────────────────

describe("chatRequestSchema", () => {
  it("accepts a minimal valid query", () => {
    const result = chatRequestSchema.parse({
      query: "What is the GST liability for Acme?",
    });
    expect(result.query).toBe("What is the GST liability for Acme?");
    expect(result.clientId).toBeUndefined();
    expect(result.filters).toBeUndefined();
  });

  it("accepts a query with optional clientId and filters", () => {
    const result = chatRequestSchema.parse({
      query: "Find all invoices",
      clientId: "00000000-0000-0000-0000-000000000001",
      filters: {
        source: ["gmail", "drive"],
        dateFrom: "2025-01-01T00:00:00.000Z",
        dateTo: "2025-12-31T23:59:59.000Z",
      },
    });
    expect(result.clientId).toBe("00000000-0000-0000-0000-000000000001");
    expect(result.filters?.source).toEqual(["gmail", "drive"]);
  });

  it("rejects an empty query", () => {
    expect(() => chatRequestSchema.parse({ query: "" })).toThrow();
  });

  it("rejects a query over 5000 characters", () => {
    expect(() =>
      chatRequestSchema.parse({ query: "a".repeat(5001) }),
    ).toThrow();
  });

  it("rejects an invalid source in filters", () => {
    expect(() =>
      chatRequestSchema.parse({ query: "test", filters: { source: ["fax"] } }),
    ).toThrow();
  });

  it("rejects a non-ISO datetime in filters.dateFrom", () => {
    expect(() =>
      chatRequestSchema.parse({
        query: "test",
        filters: { dateFrom: "01-01-2025" },
      }),
    ).toThrow();
  });
});

// ─── documentListQuerySchema ──────────────────────────────────────────────────

describe("documentListQuerySchema", () => {
  it("applies defaults for page and pageSize when empty object is passed", () => {
    const result = documentListQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("coerces string numbers from query-string params", () => {
    const result = documentListQuerySchema.parse({ page: "3", pageSize: "50" });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });

  it("accepts a valid source filter", () => {
    const result = documentListQuerySchema.parse({ source: "gmail" });
    expect(result.source).toBe("gmail");
  });

  it("accepts a valid status filter", () => {
    const result = documentListQuerySchema.parse({ status: "ready" });
    expect(result.status).toBe("ready");
  });

  it("rejects pageSize greater than 100", () => {
    expect(() => documentListQuerySchema.parse({ pageSize: "101" })).toThrow();
  });

  it("rejects page less than 1", () => {
    expect(() => documentListQuerySchema.parse({ page: "0" })).toThrow();
  });

  it("rejects an invalid source value", () => {
    expect(() =>
      documentListQuerySchema.parse({ source: "dropbox" }),
    ).toThrow();
  });

  it("rejects an invalid status value", () => {
    expect(() => documentListQuerySchema.parse({ status: "done" })).toThrow();
  });

  it("accepts a valid clientId UUID", () => {
    const id = "12345678-1234-1234-1234-123456789012";
    const result = documentListQuerySchema.parse({ clientId: id });
    expect(result.clientId).toBe(id);
  });
});

// ─── createClientSchema ───────────────────────────────────────────────────────

describe("createClientSchema", () => {
  it("accepts a minimal valid client", () => {
    const result = createClientSchema.parse({
      name: "Acme Exports Pvt Ltd",
      identifier: "ACME-001",
    });
    expect(result.name).toBe("Acme Exports Pvt Ltd");
    expect(result.identifier).toBe("ACME-001");
    expect(result.emailDomain).toBeUndefined();
    expect(result.metadata).toBeUndefined();
  });

  it("accepts optional emailDomain and metadata", () => {
    const result = createClientSchema.parse({
      name: "Acme",
      identifier: "ACME",
      emailDomain: "acme.in",
      metadata: { pan: "ABCDE1234F", gstNumber: "27AAPFU0939F1ZV" },
    });
    expect(result.emailDomain).toBe("acme.in");
    expect(result.metadata?.pan).toBe("ABCDE1234F");
  });

  it("rejects a missing name", () => {
    expect(() =>
      createClientSchema.parse({ identifier: "ACME-001" }),
    ).toThrow();
  });

  it("rejects an empty name", () => {
    expect(() =>
      createClientSchema.parse({ name: "", identifier: "ACME-001" }),
    ).toThrow();
  });

  it("rejects a name longer than 255 characters", () => {
    expect(() =>
      createClientSchema.parse({
        name: "a".repeat(256),
        identifier: "ID",
      }),
    ).toThrow();
  });

  it("rejects a missing identifier", () => {
    expect(() => createClientSchema.parse({ name: "Acme" })).toThrow();
  });
});

// ─── inviteUserSchema ─────────────────────────────────────────────────────────

describe("inviteUserSchema", () => {
  it("defaults role to 'member' when role is omitted", () => {
    const result = inviteUserSchema.parse({ email: "associate@ca.in" });
    expect(result.role).toBe("member");
  });

  it("accepts 'admin' role explicitly", () => {
    const result = inviteUserSchema.parse({
      email: "owner@ca.in",
      role: "admin",
    });
    expect(result.role).toBe("admin");
  });

  it("accepts 'member' role explicitly", () => {
    const result = inviteUserSchema.parse({
      email: "staff@ca.in",
      role: "member",
    });
    expect(result.role).toBe("member");
  });

  it("rejects an invalid email address", () => {
    expect(() => inviteUserSchema.parse({ email: "not-an-email" })).toThrow();
  });

  it("rejects a missing email", () => {
    expect(() => inviteUserSchema.parse({ role: "member" })).toThrow();
  });

  it("rejects an unknown role", () => {
    expect(() =>
      inviteUserSchema.parse({ email: "user@ca.in", role: "superadmin" }),
    ).toThrow();
  });
});

// ─── feedbackSchema ───────────────────────────────────────────────────────────

describe("feedbackSchema", () => {
  it.each(["positive", "negative", "none"] as const)(
    "accepts '%s' as a valid feedback value",
    (value) => {
      const result = feedbackSchema.parse({ feedback: value });
      expect(result.feedback).toBe(value);
    },
  );

  it("rejects an unrecognised feedback value", () => {
    expect(() => feedbackSchema.parse({ feedback: "meh" })).toThrow();
  });

  it("rejects an empty feedback string", () => {
    expect(() => feedbackSchema.parse({ feedback: "" })).toThrow();
  });

  it("rejects a missing feedback field", () => {
    expect(() => feedbackSchema.parse({})).toThrow();
  });
});

// ─── sendDraftSchema ──────────────────────────────────────────────────────────

describe("sendDraftSchema", () => {
  it("accepts a valid draft with required fields", () => {
    const result = sendDraftSchema.parse({
      to: "client@example.com",
      subject: "GST Return Filing - Q4 2024",
      body: "Dear Sir, Please find attached...",
    });
    expect(result.to).toBe("client@example.com");
    expect(result.subject).toBe("GST Return Filing - Q4 2024");
    expect(result.threadId).toBeUndefined();
  });

  it("accepts a draft with optional threadId", () => {
    const result = sendDraftSchema.parse({
      to: "client@example.com",
      subject: "Re: ITR Filing",
      body: "Thank you for your response.",
      threadId: "thread-abc-123",
    });
    expect(result.threadId).toBe("thread-abc-123");
  });

  it("rejects an invalid email address", () => {
    expect(() =>
      sendDraftSchema.parse({
        to: "not-an-email",
        subject: "Test",
        body: "Hello",
      }),
    ).toThrow();
  });

  it("rejects a missing subject", () => {
    expect(() =>
      sendDraftSchema.parse({
        to: "client@example.com",
        body: "Hello",
      }),
    ).toThrow();
  });

  it("rejects an empty body", () => {
    expect(() =>
      sendDraftSchema.parse({
        to: "client@example.com",
        subject: "Test",
        body: "",
      }),
    ).toThrow();
  });

  it("rejects a subject over 500 characters", () => {
    expect(() =>
      sendDraftSchema.parse({
        to: "client@example.com",
        subject: "x".repeat(501),
        body: "Hello",
      }),
    ).toThrow();
  });
});

// ─── syncRequestSchema ─────────────────────────────────────────────────────

describe("syncRequestSchema", () => {
  it("accepts empty keywords array", () => {
    const result = syncRequestSchema.parse({
      keywords: [],
      includeAllKeywords: true,
    });
    expect(result.keywords).toEqual([]);
    expect(result.includeAllKeywords).toBe(true);
  });

  it("accepts valid keywords array", () => {
    const result = syncRequestSchema.parse({
      keywords: ["invoice", "payment", "tax"],
      includeAllKeywords: false,
    });
    expect(result.keywords).toEqual(["invoice", "payment", "tax"]);
    expect(result.includeAllKeywords).toBe(false);
  });

  it("trims whitespace from keywords", () => {
    const result = syncRequestSchema.parse({
      keywords: ["  invoice  ", " payment", "tax "],
      includeAllKeywords: true,
    });
    expect(result.keywords).toEqual(["invoice", "payment", "tax"]);
  });

  it("filters out empty strings after trimming", () => {
    const result = syncRequestSchema.parse({
      keywords: ["invoice", "", "payment", "   ", "tax"],
      includeAllKeywords: true,
    });
    expect(result.keywords).toEqual(["invoice", "payment", "tax"]);
  });

  it("defaults includeAllKeywords to true when not provided", () => {
    const result = syncRequestSchema.parse({
      keywords: ["invoice"],
    });
    expect(result.includeAllKeywords).toBe(true);
  });

  it("accepts optional empty object (no keywords)", () => {
    const result = syncRequestSchema.parse({});
    expect(result.keywords).toEqual([]);
    expect(result.includeAllKeywords).toBe(true);
  });

  it("rejects more than 20 keywords", () => {
    const tooManyKeywords = Array(21).fill("keyword");
    expect(() =>
      syncRequestSchema.parse({
        keywords: tooManyKeywords,
        includeAllKeywords: true,
      }),
    ).toThrow("Maximum 20 keywords allowed");
  });

  it("rejects keywords longer than 100 characters", () => {
    expect(() =>
      syncRequestSchema.parse({
        keywords: ["a".repeat(101)],
        includeAllKeywords: true,
      }),
    ).toThrow();
  });

  it("accepts keywords exactly 100 characters", () => {
    const result = syncRequestSchema.parse({
      keywords: ["a".repeat(100)],
      includeAllKeywords: true,
    });
    expect(result.keywords).toEqual(["a".repeat(100)]);
  });
});
