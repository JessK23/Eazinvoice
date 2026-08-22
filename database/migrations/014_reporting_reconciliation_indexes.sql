CREATE INDEX IF NOT EXISTS eazinvoice_invoices_business_invoice_date_idx
  ON eazinvoice_invoices (business_id, invoice_date);

CREATE INDEX IF NOT EXISTS eazinvoice_invoices_business_due_date_idx
  ON eazinvoice_invoices (business_id, due_date);

CREATE INDEX IF NOT EXISTS eazinvoice_payments_business_payment_date_idx
  ON eazinvoice_payments (business_id, payment_date);

CREATE INDEX IF NOT EXISTS eazinvoice_journal_entries_business_date_idx
  ON eazinvoice_journal_entries (business_id, journal_date);

CREATE INDEX IF NOT EXISTS eazinvoice_journal_lines_business_account_idx
  ON eazinvoice_journal_lines (business_id, account_id);

CREATE INDEX IF NOT EXISTS eazinvoice_journal_entries_business_source_idx
  ON eazinvoice_journal_entries (business_id, source_type, source_id);

INSERT INTO eazinvoice_migrations (migration_name)
VALUES ('014_reporting_reconciliation_indexes')
ON CONFLICT (migration_name) DO NOTHING;
