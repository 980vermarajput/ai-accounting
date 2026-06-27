#!/usr/bin/env bash
#
# One-shot end-to-end verification of enforced Row-Level Security.
#
#   bash apps/api/prisma/rls/verify.sh
#
# Runs from anywhere. Override defaults via env vars, e.g.:
#   PGHOST=db PGPORT=5433 APP_PW=secret bash apps/api/prisma/rls/verify.sh
#
# It: checks Postgres is reachable, applies migrations, (re)creates the
# restricted app_user role, then runs the DB-layer (psql) and app-layer
# (Prisma extension) isolation tests.
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
ADMIN_USER="${ADMIN_USER:-postgres}"
ADMIN_PW="${ADMIN_PW:-postgres}"
DB="${DB:-ai_accounting}"
APP_PW="${APP_PW:-app_pw_local_test}"

# Resolve apps/api regardless of where this is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$API_DIR"

ADMIN_URL="postgresql://${ADMIN_USER}:${ADMIN_PW}@${PGHOST}:${PGPORT}/${DB}?schema=public"
APP_URL="postgresql://app_user:${APP_PW}@${PGHOST}:${PGPORT}/${DB}?schema=public"
psql_admin() { PGPASSWORD="$ADMIN_PW" psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$DB" "$@"; }

echo "▶ 1/4  Checking Postgres at ${PGHOST}:${PGPORT}/${DB} ..."
if ! psql_admin -tAc "SELECT 1" >/dev/null 2>&1; then
  echo "✖ Cannot reach the database. Start it first:"
  echo "    docker compose -f docker-compose.dev.yml up -d"
  exit 1
fi

echo "▶ 2/4  Applying migrations ..."
DATABASE_URL="$ADMIN_URL" pnpm exec prisma migrate deploy >/dev/null
echo "   ✓ migrations up to date"

echo "▶ 3/4  Ensuring app_user role + DB-layer test ..."
psql_admin -v app_pw="$APP_PW" -f prisma/rls/setup-roles.sql >/dev/null
# Guarantee the password matches APP_PW even if the role already existed.
psql_admin -c "ALTER ROLE app_user WITH PASSWORD '${APP_PW}'" >/dev/null
psql_admin -f prisma/rls/rls-test.sql

echo "▶ 4/4  App-layer test (Prisma extension) ..."
RLS_ENFORCE=true \
  DATABASE_URL="$APP_URL" \
  ADMIN_DATABASE_URL="$ADMIN_URL" \
  NODE_ENV=production \
  ./node_modules/.bin/tsx src/scripts/rls-smoke.ts

echo "✔ RLS verification complete."
