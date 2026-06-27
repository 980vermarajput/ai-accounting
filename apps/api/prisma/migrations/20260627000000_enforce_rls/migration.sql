-- Enforced Row-Level Security (tenant isolation by firm).
--
-- Each tenant table gets a policy comparing its firm_id against the
-- per-request session variable `app.current_firm_id`, which the application's
-- tenant-context layer sets inside a transaction (see src/lib/tenant-context.ts).
--
-- IMPORTANT — this migration is INERT until the app connects as a non-superuser,
-- non-BYPASSRLS role. PostgreSQL superusers (and BYPASSRLS roles) skip RLS even
-- with FORCE, so while the app connects as `postgres` nothing changes. Enforcement
-- begins once DATABASE_URL points at the restricted `app_user` role
-- (see prisma/rls/setup-roles.sql) and RLS_ENFORCE=true.
--
-- `current_setting('app.current_firm_id', true)` returns NULL when unset
-- (missing_ok = true), and NULLIF guards against an empty string, so a query
-- issued with no firm context matches no rows — i.e. fail-closed.

-- ── firm_id-bearing tenant tables ───────────────────────────────────────────
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'users','clients','documents','chunks','queries','audit_logs','sync_jobs',
    'chat_sessions','extracted_deadlines','alerts','daily_briefings',
    'firm_invites','telegram_links'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL '
      || 'USING (firm_id = NULLIF(current_setting(''app.current_firm_id'', true), '''')::uuid) '
      || 'WITH CHECK (firm_id = NULLIF(current_setting(''app.current_firm_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END $$;

-- ── firms: the tenant root, keyed on id ─────────────────────────────────────
ALTER TABLE firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE firms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON firms;
CREATE POLICY tenant_isolation ON firms FOR ALL
  USING (id = NULLIF(current_setting('app.current_firm_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_firm_id', true), '')::uuid);

-- ── chat_messages: no firm_id of its own; scoped through its parent session ──
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON chat_messages;
CREATE POLICY tenant_isolation ON chat_messages FOR ALL
  USING (
    session_id IN (
      SELECT id FROM chat_sessions
      WHERE firm_id = NULLIF(current_setting('app.current_firm_id', true), '')::uuid
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM chat_sessions
      WHERE firm_id = NULLIF(current_setting('app.current_firm_id', true), '')::uuid
    )
  );
