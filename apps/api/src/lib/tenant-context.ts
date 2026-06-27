import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "@prisma/client";

/**
 * Per-request tenant context.
 *
 * The current firm id is carried implicitly through the async call chain via
 * AsyncLocalStorage, so the Prisma RLS extension (see below) can scope every
 * query to the right tenant without each call site threading `firmId` around.
 *
 * `requireAuth` populates this for authenticated requests. Privileged, cross-firm
 * flows (OAuth login before a firm is known, the daily scheduler / workers that
 * iterate all firms, and the platform-admin dashboard) deliberately run WITHOUT
 * a context and must use `prismaAdmin` once RLS enforcement is switched on.
 */
const store = new AsyncLocalStorage<{ firmId: string }>();

/** Run `fn` (and everything it awaits) with the given firm as the active tenant. */
export function withFirmContext<T>(firmId: string, fn: () => T): T {
  return store.run({ firmId }, fn);
}

/** The active firm id, or undefined when running outside a tenant context. */
export function getFirmContext(): string | undefined {
  return store.getStore()?.firmId;
}

/** Whether enforced RLS is switched on. Off by default — see prisma/rls/README.md. */
export const RLS_ENFORCE = process.env.RLS_ENFORCE === "true";

/**
 * Wrap a base Prisma client so every model operation runs inside a transaction
 * that first sets `app.current_firm_id`, which the RLS policies compare against.
 *
 * Batching `set_config` + the query in a single `$transaction([...])` guarantees
 * both run on the same connection (a plain `SET LOCAL` outside a transaction
 * would not survive connection pooling). Raw and transaction calls are not
 * model operations, so they are not intercepted and cannot recurse.
 *
 * When no firm context is set the query is passed through untouched — under the
 * restricted role the policies then match no rows (fail-closed), which is why
 * privileged flows must use `prismaAdmin` instead.
 */
export function applyRlsExtension(client: PrismaClient): PrismaClient {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const firmId = getFirmContext();
          if (!firmId) return query(args);
          const [, result] = await client.$transaction([
            client.$executeRaw`SELECT set_config('app.current_firm_id', ${firmId}, true)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  }) as unknown as PrismaClient;
}
