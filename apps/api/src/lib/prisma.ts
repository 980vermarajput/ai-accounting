import { PrismaClient } from "@prisma/client";
import { applyRlsExtension, RLS_ENFORCE } from "./tenant-context";

// Singleton pattern — avoids exhausting DB connections during hot-reload
const globalForPrisma = globalThis as unknown as {
  prismaBase: PrismaClient;
  prismaAdmin: PrismaClient;
};

const base: PrismaClient =
  globalForPrisma.prismaBase ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaBase = base;
}

/**
 * Tenant-scoped client used by all request-handling code.
 *
 * With RLS_ENFORCE off (default) this is the plain client — no behaviour change.
 * With it on, every model query is scoped to the active firm context via RLS.
 */
export const prisma: PrismaClient = RLS_ENFORCE ? applyRlsExtension(base) : base;

/**
 * Privileged client that bypasses tenant scoping — for OAuth login, the
 * cross-firm scheduler/workers, and the platform-admin dashboard. When
 * enforcement is on, point ADMIN_DATABASE_URL at a BYPASSRLS role; otherwise it
 * is the same superuser connection as `prisma` (which already bypasses RLS).
 */
export const prismaAdmin: PrismaClient =
  RLS_ENFORCE && process.env.ADMIN_DATABASE_URL
    ? (globalForPrisma.prismaAdmin ??
      new PrismaClient({
        datasources: { db: { url: process.env.ADMIN_DATABASE_URL } },
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      }))
    : base;

if (
  process.env.NODE_ENV !== "production" &&
  RLS_ENFORCE &&
  process.env.ADMIN_DATABASE_URL
) {
  globalForPrisma.prismaAdmin = prismaAdmin;
}
