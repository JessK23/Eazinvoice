BEGIN;

CREATE TABLE IF NOT EXISTS eazinvoice_business_settings (
  id text PRIMARY KEY,
  owner_user_id text,
  company_id text,
  smtp_configured boolean NOT NULL DEFAULT false,
  payment_gateway_configured boolean NOT NULL DEFAULT false,
  payment_link_enabled boolean NOT NULL DEFAULT false,
  compliance_status text,
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_business_settings_owner_idx
  ON eazinvoice_business_settings (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_business_settings_company_idx
  ON eazinvoice_business_settings (company_id);

CREATE TABLE IF NOT EXISTS eazinvoice_team_members (
  id text PRIMARY KEY,
  owner_user_id text,
  company_id text,
  email text,
  name text,
  role text NOT NULL DEFAULT 'viewer',
  status text NOT NULL DEFAULT 'invited',
  invited_by_user_id text,
  accepted_user_id text,
  invite_expires_at timestamptz,
  invite_delivery_status text,
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_team_members_owner_idx
  ON eazinvoice_team_members (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_team_members_email_idx
  ON eazinvoice_team_members (lower(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE INDEX IF NOT EXISTS eazinvoice_team_members_status_idx
  ON eazinvoice_team_members (status);

CREATE TABLE IF NOT EXISTS eazinvoice_approval_requests (
  id text PRIMARY KEY,
  owner_user_id text,
  company_id text,
  document_type text NOT NULL DEFAULT 'invoice',
  document_id text,
  document_number text,
  requested_by_user_id text,
  approver_user_id text,
  status text NOT NULL DEFAULT 'pending',
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_approval_requests_owner_idx
  ON eazinvoice_approval_requests (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_approval_requests_status_idx
  ON eazinvoice_approval_requests (status);

CREATE TABLE IF NOT EXISTS eazinvoice_api_keys (
  id text PRIMARY KEY,
  owner_user_id text,
  company_id text,
  label text,
  token_preview text,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  revoked_at timestamptz,
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_api_keys_owner_idx
  ON eazinvoice_api_keys (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_api_keys_status_idx
  ON eazinvoice_api_keys (status);

INSERT INTO eazinvoice_migrations (migration_name)
VALUES ('005_business_workspace_tables')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;
