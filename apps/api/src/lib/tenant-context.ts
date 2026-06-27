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

/**
 * Run `fn` (and everything it awaits) with the given firm as the active tenant.
 *
 * The callback is awaited *inside* the context frame on purpose: Prisma's
 * `PrismaPromise` is lazy, so a caller like `() => prisma.x.findMany()` only
 * starts the query when it is awaited. Awaiting here guarantees that happens
 * while the AsyncLocalStorage context is still active, even when the caller
 * hands back the promise without awaiting it themselves.
 */
export function withFirmContext<T>(firmId: string, fn: () => T | Promise<T>): Promise<T> {
  return store.run({ firmId }, async () => fn());
}

/** The active firm id, or undefined when running outside a tenant context. */
export function getFirmContext(): string | undefined {
  return store.getStore()?.firmId;
}

/** Whether enforced RLS is switched on. Off by default — see prisma/rls/README.md. */
export const RLS_ENFORCE = process.env.RLS_ENFORCE === "true";

/**
 * Wrap a base Prisma client so every model operation runs inside an interactive
 * transaction that first sets `app.current_firm_id` — the value the RLS policies
 * compare against — and then runs the operation on the SAME transaction client.
 *
 * Routing the operation through `tx` is what guarantees the session variable and
 * the query share one connection. (A batched `$transaction([setConfig, query]))`
 * does not reliably bind them, and a plain `SET LOCAL` would not survive
 * connection pooling.) The transaction client is unextended, so re-dispatching
 * `tx[model][operation](args)` does not recurse through this wrapper.
 *
 * When no firm context is set the query is passed through untouched — under the
 * restricted role the policies then match no rows (fail-closed), which is why
 * privileged flows must use `prismaAdmin` instead.
 */
export function applyRlsExtension(client: PrismaClient): PrismaClient {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const firmId = getFirmContext();
          if (!firmId || !model) return query(args);
          const accessor = model.charAt(0).toLowerCase() + model.slice(1);
          return client.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
              "SELECT set_config('app.current_firm_id', $1, true)",
              firmId,
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (tx as any)[accessor][operation](args);
          });
        },
      },
    },
  }) as unknown as PrismaClient;
}
