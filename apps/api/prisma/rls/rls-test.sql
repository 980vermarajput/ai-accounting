-- Local proof that enforced RLS isolates tenants.
--
-- Prereqs (see README.md):
--   1. enforce_rls migration applied
--   2. app_user role created via setup-roles.sql
-- Run as a SUPERUSER (it switches to app_user internally):
--   psql "$DATABASE_URL" -f prisma/rls/rls-test.sql
--
-- Expected: Firm A context sees only Client A, Firm B sees only Client B,
-- no context sees nothing, and a cross-tenant write is rejected.

\set ON_ERROR_STOP off

-- ── Fixture (created as superuser, which bypasses RLS) ───────────────────────
DELETE FROM clients WHERE identifier IN ('CLI-A','CLI-B','SNEAK');
DELETE FROM users   WHERE email IN ('a@rls.test','b@rls.test');
DELETE FROM firms   WHERE slug   IN ('firm-a-rls-test','firm-b-rls-test');

INSERT INTO firms (id, name, slug, updated_at) VALUES
  ('11111111-1111-1111-1111-111111111111','Firm A','firm-a-rls-test', now()),
  ('22222222-2222-2222-2222-222222222222','Firm B','firm-b-rls-test', now());

INSERT INTO users (id, firm_id, email, name, role, updated_at) VALUES
  ('a0000000-0000-0000-0000-0000000000a0','11111111-1111-1111-1111-111111111111','a@rls.test','User A','admin', now()),
  ('b0000000-0000-0000-0000-0000000000b0','22222222-2222-2222-2222-222222222222','b@rls.test','User B','admin', now());

INSERT INTO clients (firm_id, created_by, name, identifier) VALUES
  ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-0000000000a0','Client A','CLI-A'),
  ('22222222-2222-2222-2222-222222222222','b0000000-0000-0000-0000-0000000000b0','Client B','CLI-B');

-- ── Switch to the restricted role (RLS now applies) ─────────────────────────
SET ROLE app_user;

\echo '>>> Context = Firm A  (EXPECT: only Client A)'
SELECT set_config('app.current_firm_id','11111111-1111-1111-1111-111111111111', false);
SELECT name FROM clients ORDER BY name;

\echo '>>> Context = Firm B  (EXPECT: only Client B)'
SELECT set_config('app.current_firm_id','22222222-2222-2222-2222-222222222222', false);
SELECT name FROM clients ORDER BY name;

\echo '>>> No context     (EXPECT: 0 — fail-closed)'
SELECT set_config('app.current_firm_id','', false);
SELECT count(*) AS visible_clients FROM clients;

\echo '>>> Cross-tenant write while in Firm A context (EXPECT: error / 0 rows inserted)'
SELECT set_config('app.current_firm_id','11111111-1111-1111-1111-111111111111', false);
INSERT INTO clients (firm_id, created_by, name, identifier)
VALUES ('22222222-2222-2222-2222-222222222222','a0000000-0000-0000-0000-0000000000a0','Sneaky','SNEAK');

RESET ROLE;

-- ── Cleanup (as superuser) ──────────────────────────────────────────────────
DELETE FROM clients WHERE identifier IN ('CLI-A','CLI-B','SNEAK');
DELETE FROM users   WHERE email IN ('a@rls.test','b@rls.test');
DELETE FROM firms   WHERE slug   IN ('firm-a-rls-test','firm-b-rls-test');
\echo '>>> Done.'
