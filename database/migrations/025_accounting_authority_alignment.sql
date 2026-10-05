BEGIN;

ALTER TABLE IF EXISTS eazinvoice_ledger_accounts
  ADD COLUMN IF NOT EXISTS account_role text,
  ADD COLUMN IF NOT EXISTS balance_sheet_category text;

CREATE TABLE IF NOT EXISTS eazinvoice_accounting_authority_migrations (
  id text PRIMARY KEY,
  business_id text NOT NULL,
  migration_version text NOT NULL,
  status text NOT NULL,
  classification jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  fingerprint text,
  attempt_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, migration_version)
);

CREATE TABLE IF NOT EXISTS eazinvoice_accounting_authority_mappings (
  id text PRIMARY KEY,
  business_id text NOT NULL,
  migration_id text NOT NULL REFERENCES eazinvoice_accounting_authority_migrations(id),
  legacy_account_id text NOT NULL,
  canonical_role text NOT NULL,
  mapping_status text NOT NULL,
  reason_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, legacy_account_id, canonical_role)
);

CREATE INDEX IF NOT EXISTS eazinvoice_accounting_authority_migrations_business_idx
  ON eazinvoice_accounting_authority_migrations (business_id, migration_version, status);
CREATE INDEX IF NOT EXISTS eazinvoice_accounting_authority_mappings_business_idx
  ON eazinvoice_accounting_authority_mappings (business_id, legacy_account_id);

ALTER TABLE IF EXISTS eazinvoice_accounting_authority_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS eazinvoice_accounting_authority_migrations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eazinvoice_tenant_isolation ON eazinvoice_accounting_authority_migrations;
CREATE POLICY eazinvoice_tenant_isolation ON eazinvoice_accounting_authority_migrations
  USING (eazinvoice_rls_bypass() OR business_id = eazinvoice_current_business_id())
  WITH CHECK (eazinvoice_rls_bypass() OR business_id = eazinvoice_current_business_id());

ALTER TABLE IF EXISTS eazinvoice_accounting_authority_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS eazinvoice_accounting_authority_mappings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eazinvoice_tenant_isolation ON eazinvoice_accounting_authority_mappings;
CREATE POLICY eazinvoice_tenant_isolation ON eazinvoice_accounting_authority_mappings
  USING (eazinvoice_rls_bypass() OR business_id = eazinvoice_current_business_id())
  WITH CHECK (eazinvoice_rls_bypass() OR business_id = eazinvoice_current_business_id());

INSERT INTO eazinvoice_migrations (migration_name)
VALUES ('025_accounting_authority_alignment')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;
