/**
 * Active-client usage — the metering primitive behind per-active-client pricing.
 *
 * Phase 0 scaffolding: counts and surfaces usage against the firm's plan
 * allowance, but does NOT hard-gate (soft cap during the free pilot). Stripe
 * enforcement is deferred to post-Phase-1.
 *
 * "Active" = any activity in the trailing window: a client with `lastActivityAt`
 * in-window, or with a document ingested in-window (fallback while
 * `lastActivityAt` backfill rolls out across ingest paths).
 */

import { prisma } from "./prisma";

export const ACTIVE_WINDOW_DAYS = 30;

export interface ClientUsage {
  active: number;
  allowance: number;
  withinAllowance: boolean;
}

function windowStart(days = ACTIVE_WINDOW_DAYS): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Count clients considered active for the firm in the trailing window. */
export async function getActiveClientCount(
  firmId: string,
  days = ACTIVE_WINDOW_DAYS,
): Promise<number> {
  const since = windowStart(days);
  return prisma.client.count({
    where: {
      firmId,
      OR: [
        { lastActivityAt: { gt: since } },
        { documents: { some: { createdAt: { gt: since } } } },
      ],
    },
  });
}

/** The firm's plan client allowance (per-tier cap). */
export async function getClientAllowance(firmId: string): Promise<number> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { clientAllowance: true },
  });
  return firm?.clientAllowance ?? 0;
}

/** Combined usage snapshot for display + (future) soft-cap checks. */
export async function getClientUsage(firmId: string): Promise<ClientUsage> {
  const [active, allowance] = await Promise.all([
    getActiveClientCount(firmId),
    getClientAllowance(firmId),
  ]);
  return { active, allowance, withinAllowance: allowance === 0 || active <= allowance };
}
