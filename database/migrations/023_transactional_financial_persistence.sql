-- P2-1C PostgreSQL Transactional Financial Persistence & Normalization

begin;

alter table if exists eazinvoice_payments add column if not exists business_id text;
alter table if exists eazinvoice_payments add column if not exists vendor_bill_id text;
alter table if exists eazinvoice_payments add column if not exists idempotency_key text;

alter table if exists eazinvoice_financial_events add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_journal_entries add column if not exists currency text not null default 'INR';
alter table if exists eazinvoice_journal_entries add column if not exists total_debit numeric(14,2) not null default 0;
alter table if exists eazinvoice_journal_entries add column if not exists total_credit numeric(14,2) not null default 0;
alter table if exists eazinvoice_vendor_bills add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_credit_notes add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_vendor_credits add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_payment_reversals add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_vendor_payment_reversals add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_customer_refunds add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_vendor_refunds add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_bank_accounts add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_bank_statement_import_batches add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_bank_statement_lines add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_bank_reconciliation_matches add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_tax_registrations add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_transaction_compliance_snapshots add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_compliance_obligations add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_tds_transactions add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_accounting_periods add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_accounting_period_history add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_opening_balance_sets add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_opening_balance_details add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_financial_years add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_year_end_closes add column if not exists record jsonb not null default '{}'::jsonb;
alter table if exists eazinvoice_year_end_close_history add column if not exists record jsonb not null default '{}'::jsonb;

create table if not exists eazinvoice_business_number_counters (
  id text primary key,
  business_id text not null,
  counter_type text not null,
  current_value bigint not null default 0,
  prefix text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (business_id, counter_type)
);

create table if not exists eazinvoice_financial_divergence_checks (
  id bigserial primary key,
  business_id text,
  domain text not null,
  record_id text,
  severity text not null default 'warning',
  expected jsonb not null default '{}'::jsonb,
  actual jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  checked_at timestamptz not null default now()
);

create unique index if not exists uq_eazinvoice_invoices_business_number
  on eazinvoice_invoices (business_id, invoice_number)
  where business_id is not null and coalesce(invoice_number, '') <> '';

create unique index if not exists uq_eazinvoice_payments_business_idempotency
  on eazinvoice_payments (business_id, idempotency_key)
  where business_id is not null and coalesce(idempotency_key, '') <> '';

create unique index if not exists uq_eazinvoice_journal_entries_business_event
  on eazinvoice_journal_entries (business_id, financial_event_id)
  where business_id is not null and financial_event_id is not null and financial_event_id <> '';

create unique index if not exists uq_eazinvoice_bank_recon_active_statement_source
  on eazinvoice_bank_reconciliation_matches (business_id, statement_line_id, source_type, source_id)
  where status = 'matched';

alter table if exists eazinvoice_journal_lines
  add constraint eazinvoice_journal_lines_debit_credit_check
  check (
    (coalesce(debit, 0) >= 0 and coalesce(credit, 0) >= 0)
    and not (coalesce(debit, 0) > 0 and coalesce(credit, 0) > 0)
  ) not valid;

alter table if exists eazinvoice_bank_statement_lines
  add constraint eazinvoice_bank_statement_amount_check
  check (coalesce(matched_amount, 0) >= 0 and coalesce(unmatched_amount, 0) >= 0) not valid;

alter table if exists eazinvoice_business_number_counters enable row level security;
alter table if exists eazinvoice_business_number_counters force row level security;
drop policy if exists eazinvoice_tenant_isolation on eazinvoice_business_number_counters;
create policy eazinvoice_tenant_isolation on eazinvoice_business_number_counters
  using (eazinvoice_rls_bypass() or business_id = eazinvoice_current_business_id())
  with check (eazinvoice_rls_bypass() or business_id = eazinvoice_current_business_id());

alter table if exists eazinvoice_financial_divergence_checks enable row level security;
alter table if exists eazinvoice_financial_divergence_checks force row level security;
drop policy if exists eazinvoice_tenant_isolation on eazinvoice_financial_divergence_checks;
create policy eazinvoice_tenant_isolation on eazinvoice_financial_divergence_checks
  using (eazinvoice_rls_bypass() or business_id = eazinvoice_current_business_id())
  with check (eazinvoice_rls_bypass() or business_id = eazinvoice_current_business_id());

insert into eazinvoice_migrations (migration_name)
values ('023_transactional_financial_persistence')
on conflict (migration_name) do nothing;

commit;
