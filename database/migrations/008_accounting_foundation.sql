BEGIN;

CREATE TABLE IF NOT EXISTS eazinvoice_ledger_accounts (
  id text PRIMARY KEY,
  owner_user_id text,
  company_id text,
  account_code text NOT NULL,
  account_name text NOT NULL,
  account_type text NOT NULL,
  normal_balance text NOT NULL,
  system_account boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS eazinvoice_ledger_accounts_scope_code_idx
  ON eazinvoice_ledger_accounts (coalesce(owner_user_id, ''), coalesce(company_id, ''), account_code);

CREATE INDEX IF NOT EXISTS eazinvoice_ledger_accounts_owner_idx
  ON eazinvoice_ledger_accounts (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_ledger_accounts_type_idx
  ON eazinvoice_ledger_accounts (account_type, status);

CREATE TABLE IF NOT EXISTS eazinvoice_ledger_transactions (
  id text PRIMARY KEY,
  owner_user_id text,
  company_id text,
  transaction_date date,
  source_type text NOT NULL,
  source_id text,
  reference_number text,
  narration text,
  status text NOT NULL DEFAULT 'posted',
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_ledger_transactions_owner_idx
  ON eazinvoice_ledger_transactions (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_ledger_transactions_source_idx
  ON eazinvoice_ledger_transactions (source_type, source_id);

CREATE INDEX IF NOT EXISTS eazinvoice_ledger_transactions_date_idx
  ON eazinvoice_ledger_transactions (transaction_date);

CREATE TABLE IF NOT EXISTS eazinvoice_ledger_entries (
  id text PRIMARY KEY,
  transaction_id text NOT NULL,
  owner_user_id text,
  company_id text,
  account_id text NOT NULL,
  debit numeric(14,2) NOT NULL DEFAULT 0,
  credit numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_ledger_entries_transaction_idx
  ON eazinvoice_ledger_entries (transaction_id);

CREATE INDEX IF NOT EXISTS eazinvoice_ledger_entries_owner_idx
  ON eazinvoice_ledger_entries (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_ledger_entries_account_idx
  ON eazinvoice_ledger_entries (account_id);

CREATE TABLE IF NOT EXISTS eazinvoice_journal_entries (
  id text PRIMARY KEY,
  owner_user_id text,
  company_id text,
  journal_number text,
  journal_date date,
  narration text,
  status text NOT NULL DEFAULT 'draft',
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_journal_entries_owner_idx
  ON eazinvoice_journal_entries (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_journal_entries_date_idx
  ON eazinvoice_journal_entries (journal_date);

INSERT INTO eazinvoice_migrations (migration_name)
VALUES ('008_accounting_foundation')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;
