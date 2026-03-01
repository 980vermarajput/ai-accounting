/**
 * Unit tests for alert-detector.ts
 *
 * Strategy:
 *  - prisma is mocked at module level
 *  - Tests verify each detection rule independently
 *  - Deduplication logic tested separately
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Prisma ────────────────────────────────────────────────

vi.mock("./prisma", () => ({
  prisma: {
    alert: {
      findFirst: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
    },
    client: {
      findMany: vi.fn(),
    },
    chunk: {
      findMany: vi.fn(),
    },
    firm: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

// ─── Mock Logger ────────────────────────────────────────────────

vi.mock("./logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Imports (after mocks) ──────────────────────────────────────

import { prisma } from "./prisma";
import { detectAlertsForFirm, detectAlertsForAllFirms } from "./alert-detector";

const FIRM_ID = "firm-001";

describe("alert-detector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── detectAlertsForFirm ─────────────────────────────────────

  describe("detectAlertsForFirm", () => {
    it("returns counts with no alerts when there are no matching conditions", async () => {
      // No overdue invoices
      vi.mocked(prisma.document.findMany).mockResolvedValue([]);
      // No silent clients — all clients active
      vi.mocked(prisma.client.findMany).mockResolvedValue([]);
      // No high-risk chunks
      vi.mocked(prisma.chunk.findMany).mockResolvedValue([]);

      const result = await detectAlertsForFirm(FIRM_ID);

      expect(result).toEqual({
        generated: 0,
        skipped: 0,
        errors: [],
      });
    });

    it("creates CLIENT_SILENT alerts for inactive clients", async () => {
      // No invoices
      vi.mocked(prisma.document.findMany).mockResolvedValue([]);

      // One silent client (>30 days)
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      vi.mocked(prisma.client.findMany).mockResolvedValue([
        {
          id: "client-1",
          firmId: FIRM_ID,
          name: "Mehta Traders",
          identifier: "MEHTA",
          emailDomain: null,
          createdBy: "user-1",
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          documents: [{ createdAt: fortyDaysAgo }],
        } as any,
      ]);

      // No high-risk chunks
      vi.mocked(prisma.chunk.findMany).mockResolvedValue([]);

      // No existing duplicate alerts
      vi.mocked(prisma.alert.findFirst).mockResolvedValue(null);

      // Mock create to return the created alert
      vi.mocked(prisma.alert.create).mockResolvedValue({
        id: "alert-1",
        firmId: FIRM_ID,
        clientId: "client-1",
        type: "CLIENT_SILENT",
        severity: "MEDIUM",
        title: "Client inactive: Mehta Traders",
        body: "No new documents from Mehta Traders in the last 40 days.",
        metadata: {},
        isRead: false,
        resolvedAt: null,
        createdAt: new Date(),
        expiresAt: null,
      } as any);

      const result = await detectAlertsForFirm(FIRM_ID);

      expect(vi.mocked(prisma.alert.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firmId: FIRM_ID,
            clientId: "client-1",
            type: "CLIENT_SILENT",
          }),
        }),
      );
      expect(result.generated).toBeGreaterThanOrEqual(1);
    });

    it("skips duplicate alerts (same firm+client+type within 24h)", async () => {
      // No invoices
      vi.mocked(prisma.document.findMany).mockResolvedValue([]);

      // One silent client
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      vi.mocked(prisma.client.findMany).mockResolvedValue([
        {
          id: "client-1",
          firmId: FIRM_ID,
          name: "Mehta Traders",
          identifier: "MEHTA",
          emailDomain: null,
          createdBy: "user-1",
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          documents: [{ createdAt: fortyDaysAgo }],
        } as any,
      ]);

      // No high-risk chunks
      vi.mocked(prisma.chunk.findMany).mockResolvedValue([]);

      // Existing duplicate alert found
      vi.mocked(prisma.alert.findFirst).mockResolvedValue({
        id: "existing-alert",
      } as any);

      const result = await detectAlertsForFirm(FIRM_ID);

      expect(vi.mocked(prisma.alert.create)).not.toHaveBeenCalled();
      expect(result.skipped).toBeGreaterThanOrEqual(1);
    });

    it("detects HIGH_RISK_LANGUAGE in recent chunks", async () => {
      // No invoices
      vi.mocked(prisma.document.findMany).mockResolvedValue([]);
      // No silent clients
      vi.mocked(prisma.client.findMany).mockResolvedValue([]);

      // High-risk chunk
      vi.mocked(prisma.chunk.findMany).mockResolvedValue([
        {
          id: "chunk-1",
          chunkText: "The client has threatened legal action over the invoice.",
          document: {
            id: "doc-1",
            clientId: "client-2",
            filename: "letter.pdf",
            client: { name: "Gupta & Sons" },
          },
        } as any,
      ]);

      // No existing duplicate
      vi.mocked(prisma.alert.findFirst).mockResolvedValue(null);

      vi.mocked(prisma.alert.create).mockResolvedValue({
        id: "alert-risk",
        type: "HIGH_RISK_LANGUAGE",
      } as any);

      const result = await detectAlertsForFirm(FIRM_ID);

      expect(vi.mocked(prisma.alert.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "HIGH_RISK_LANGUAGE",
            severity: "HIGH",
          }),
        }),
      );
      expect(result.generated).toBeGreaterThanOrEqual(1);
    });
  });

  // ── detectAlertsForAllFirms ─────────────────────────────────

  describe("detectAlertsForAllFirms", () => {
    it("iterates all firms and logs results", async () => {
      vi.mocked(prisma.firm.findMany).mockResolvedValue([
        { id: "firm-a", name: "Firm A" } as any,
        { id: "firm-b", name: "Firm B" } as any,
      ]);

      // Each firm: no conditions
      vi.mocked(prisma.document.findMany).mockResolvedValue([]);
      vi.mocked(prisma.client.findMany).mockResolvedValue([]);
      vi.mocked(prisma.chunk.findMany).mockResolvedValue([]);

      await detectAlertsForAllFirms();

      expect(vi.mocked(prisma.firm.findMany)).toHaveBeenCalledOnce();
    });

    it("continues processing if one firm fails", async () => {
      vi.mocked(prisma.firm.findMany).mockResolvedValue([
        { id: "firm-a", name: "Firm A" } as any,
        { id: "firm-b", name: "Firm B" } as any,
      ]);

      // First firm throws on document query
      let callCount = 0;
      vi.mocked(prisma.document.findMany).mockImplementation((() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error("DB connection lost"));
        return Promise.resolve([]);
      }) as any);
      vi.mocked(prisma.client.findMany).mockResolvedValue([]);
      vi.mocked(prisma.chunk.findMany).mockResolvedValue([]);

      // Should NOT throw
      await expect(detectAlertsForAllFirms()).resolves.not.toThrow();
    });
  });
});
