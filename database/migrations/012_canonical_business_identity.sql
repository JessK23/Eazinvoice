BEGIN;

CREATE TABLE IF NOT EXISTS eazinvoice_businesses (
  id text PRIMARY KEY,
  owner_user_id text,
  legacy_owner_user_id text,
  name text NOT NULL DEFAULT 'Business workspace',
  legal_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_businesses_owner_user_id_idx
  ON eazinvoice_businesses (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_businesses_legacy_owner_user_id_idx
  ON eazinvoice_businesses (legacy_owner_user_id);

CREATE TABLE IF NOT EXISTS eazinvoice_vendors (
  id text PRIMARY KEY,
  owner_user_id text,
  company_id text,
  vendor_code text,
  name text,
  business_name text,
  email text,
  phone text,
  gst_number text,
  pan_number text,
  status text NOT NULL DEFAULT 'active',
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_vendors_owner_idx
  ON eazinvoice_vendors (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_vendors_company_idx
  ON eazinvoice_vendors (company_id);

CREATE INDEX IF NOT EXISTS eazinvoice_vendors_status_idx
  ON eazinvoice_vendors (status);

CREATE TABLE IF NOT EXISTS eazinvoice_reports (
  id text PRIMARY KEY,
  owner_user_id text,
  company_id text,
  report_type text,
  status text NOT NULL DEFAULT 'generated',
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_reports_owner_idx
  ON eazinvoice_reports (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_reports_company_idx
  ON eazinvoice_reports (company_id);

CREATE INDEX IF NOT EXISTS eazinvoice_reports_type_idx
  ON eazinvoice_reports (report_type);

ALTER TABLE eazinvoice_business_profiles ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_customers ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_vendors ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_invoices ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_purchase_orders ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_payments ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_subscriptions ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_reports ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_team_members ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_approval_requests ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_api_keys ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_business_settings ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_compliance_tasks ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_business_audit_events ADD COLUMN IF NOT EXISTS business_id text;

CREATE INDEX IF NOT EXISTS eazinvoice_business_profiles_business_id_idx ON eazinvoice_business_profiles (business_id);
CREATE INDEX IF NOT EXISTS eazinvoice_customers_business_id_idx ON eazinvoice_customers (business_id);
CREATE INDEX IF NOT EXISTS eazinvoice_vendors_business_id_idx ON eazinvoice_vendors (business_id);
CREATE INDEX IF NOT EXISTS eazinvoice_invoices_business_id_idx ON eazinvoice_invoices (business_id);
CREATE INDEX IF NOT EXISTS eazinvoice_purchase_orders_business_id_idx ON eazinvoice_purchase_orders (business_id);
CREATE INDEX IF NOT EXISTS eazinvoice_payments_business_id_idx ON eazinvoice_payments (business_id);
CREATE INDEX IF NOT EXISTS eazinvoice_subscriptions_business_id_idx ON eazinvoice_subscriptions (business_id);
CREATE INDEX IF NOT EXISTS eazinvoice_reports_business_id_idx ON eazinvoice_reports (business_id);
CREATE INDEX IF NOT EXISTS eazinvoice_team_members_business_id_idx ON eazinvoice_team_members (business_id);
CREATE INDEX IF NOT EXISTS eazinvoice_approval_requests_business_id_idx ON eazinvoice_approval_requests (business_id);
CREATE INDEX IF NOT EXISTS eazinvoice_api_keys_business_id_idx ON eazinvoice_api_keys (business_id);
CREATE INDEX IF NOT EXISTS eazinvoice_business_settings_business_id_idx ON eazinvoice_business_settings (business_id);
CREATE INDEX IF NOT EXISTS eazinvoice_compliance_tasks_business_id_idx ON eazinvoice_compliance_tasks (business_id);
CREATE INDEX IF NOT EXISTS eazinvoice_business_audit_events_business_id_idx ON eazinvoice_business_audit_events (business_id);

INSERT INTO eazinvoice_migrations (migration_name)
VALUES ('012_canonical_business_identity')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;
