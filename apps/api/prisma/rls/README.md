# Row-Level Security (tenant isolation)

Tenant isolation has two layers:

1. **Application-level** (always on): every query filters on `firmId`. This is the
   primary mechanism today.
2. **Database-level RLS** (this directory): a defence-in-depth backstop so a
   missed `where: { firmId }` cannot leak another firm's data. **Off by default.**

## How it works

- The `enforce_rls` migration enables `FORCE ROW LEVEL SECURITY` and a
  `tenant_isolation` policy on every tenant table. Policies compare `firm_id`
  against the session variable `app.current_firm_id`.
- `requireAuth` puts the firm id into an `AsyncLocalStorage` context
  ([src/lib/tenant-context.ts](../../src/lib/tenant-context.ts)).
- When `RLS_ENFORCE=true`, the Prisma client is extended so each model query runs
  inside a transaction that sets `app.current_firm_id` first.
- PostgreSQL superusers and `BYPASSRLS` roles skip RLS even with `FORCE`. So while
  the app connects as `postgres`, **the policies are inert and nothing changes** —
  which is why this is safe to ship before it is switched on.

## Turning it on

1. Apply migrations: `pnpm db:migrate` (or `prisma migrate deploy`).
2. Create the restricted role: `psql "$DATABASE_URL" -v app_pw="'…'" -f prisma/rls/setup-roles.sql`
3. Set env: `DATABASE_URL` → `app_user`, `ADMIN_DATABASE_URL` → the superuser, `RLS_ENFORCE=true`.
4. **Route privileged flows through `prismaAdmin`** (they run without a firm
   context and would otherwise see zero rows): OAuth login/`auth.ts`, the
   scheduler + workers, and `platform-admin-minimal.ts`.
5. **Validate before trusting it** — sign in as firm A, confirm firm B's rows are
   invisible, and confirm a deliberately un-scoped query returns nothing rather
   than cross-tenant rows.

## Validating it (two ready-made tests)

**DB layer (psql):** proves the policies + role in isolation.

```bash
psql "$DATABASE_URL" -v app_pw="<app_user-password>" -f prisma/rls/setup-roles.sql
psql "$DATABASE_URL" -f prisma/rls/rls-test.sql
# expect: Firm A sees only Client A, Firm B only Client B,
#         no context sees 0 rows, cross-tenant INSERT is rejected.
```

**App layer (Prisma extension):** proves `withFirmContext` + the client extension
scope queries correctly through the restricted role.

```bash
RLS_ENFORCE=true \
DATABASE_URL=postgresql://app_user:<pw>@localhost:5432/ai_accounting?schema=public \
ADMIN_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_accounting?schema=public \
NODE_ENV=production \
./node_modules/.bin/tsx src/scripts/rls-smoke.ts
# expect all ✅
```

Both were run green locally against pgvector/pgvector:pg16 when this was added.

> Migrations and data backfills must run as the owner/superuser (which bypasses
> RLS); `prisma migrate` already connects as the configured user.
