BEGIN;

CREATE TABLE IF NOT EXISTS eazinvoice_financial_events (
  id text PRIMARY KEY,
  business_id text NOT NULL,
  event_type text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  source_status text NOT NULL DEFAULT '',
  event_timestamp timestamptz NOT NULL DEFAULT now(),
  posting_status text NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL,
  journal_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  failed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS eazinvoice_financial_events_business_idempotency_idx
  ON eazinvoice_financial_events (business_id, idempotency_key);

CREATE INDEX IF NOT EXISTS eazinvoice_financial_events_source_idx
  ON eazinvoice_financial_events (business_id, source_type, source_id);

ALTER TABLE eazinvoice_ledger_accounts ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_ledger_transactions ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_ledger_entries ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_journal_entries ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE eazinvoice_journal_entries ADD COLUMN IF NOT EXISTS financial_event_id text;
ALTER TABLE eazinvoice_journal_entries ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE eazinvoice_journal_entries ADD COLUMN IF NOT EXISTS source_id text;
ALTER TABLE eazinvoice_journal_entries ADD COLUMN IF NOT EXISTS posting_rule text;
ALTER TABLE eazinvoice_journal_entries ADD COLUMN IF NOT EXISTS posting_rule_version text;
ALTER TABLE eazinvoice_journal_entries ADD COLUMN IF NOT EXISTS automatic boolean NOT NULL DEFAULT false;
ALTER TABLE eazinvoice_journal_entries ADD COLUMN IF NOT EXISTS immutable boolean NOT NULL DEFAULT false;
ALTER TABLE eazinvoice_journal_lines ADD COLUMN IF NOT EXISTS business_id text;

CREATE INDEX IF NOT EXISTS eazinvoice_ledger_accounts_business_idx ON eazinvoice_ledger_accounts (business_id);
CREATE INDEX IF NOT EXISTS eazinvoice_ledger_transactions_business_source_idx ON eazinvoice_ledger_transactions (business_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS eazinvoice_ledger_entries_business_account_idx ON eazinvoice_ledger_entries (business_id, account_id);
CREATE INDEX IF NOT EXISTS eazinvoice_journal_entries_business_source_idx ON eazinvoice_journal_entries (business_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS eazinvoice_journal_entries_financial_event_idx ON eazinvoice_journal_entries (financial_event_id);
CREATE INDEX IF NOT EXISTS eazinvoice_journal_lines_business_account_idx ON eazinvoice_journal_lines (business_id, account_id);

INSERT INTO eazinvoice_migrations (migration_name)
VALUES ('013_financial_events_accounting_posting')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;
