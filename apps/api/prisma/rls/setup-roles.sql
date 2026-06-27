-- Restricted application role for enforced Row-Level Security.
--
-- Run ONCE per database, as a superuser, AFTER applying the enforce_rls migration.
-- RLS is bypassed by superusers and BYPASSRLS roles, so the app must connect as
-- this NOSUPERUSER / no-BYPASSRLS role for the policies to take effect.
--
--   psql "$DATABASE_URL" -v app_pw="choose-a-strong-password" -f setup-roles.sql
--
-- Then set, in the API environment:
--   DATABASE_URL=postgresql://app_user:<password>@host:5432/ai_accounting?schema=public
--   ADMIN_DATABASE_URL=postgresql://postgres:<password>@host:5432/ai_accounting?schema=public
--   RLS_ENFORCE=true

-- ── Application role (subject to RLS) ───────────────────────────────────────
-- CREATE ROLE has no IF NOT EXISTS, so generate it conditionally and run via
-- \gexec. The :'app_pw' psql variable is substituted here (outside any
-- dollar-quoted block, where psql does NOT substitute variables).
-- Pass the password WITHOUT surrounding quotes: psql's :'app_pw' supplies the
-- string value, and %L quotes it safely. Run via \gexec.
SELECT format('CREATE ROLE app_user LOGIN PASSWORD %L', :'app_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user')
\gexec

-- No superuser, no RLS bypass — this is what makes the policies real.
ALTER ROLE app_user NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- ── Grants ──────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Future tables/sequences created by migrations (run as the owner) inherit grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
