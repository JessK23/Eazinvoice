-- P1-9 Accounting Period Controls & Balance Sheet Readiness
-- Forward-only schema additions for accounting periods, close governance,
-- opening balances and account presentation metadata.

alter table if exists eazinvoice_ledger_accounts
  add column if not exists account_role text,
  add column if not exists balance_sheet_category text;

create table if not exists eazinvoice_accounting_periods (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  financial_year text not null,
  period_type text not null default 'month',
  period_key text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'open',
  notes text,
  close_history jsonb not null default '[]'::jsonb,
  closed_at timestamptz,
  closed_by_user_id text,
  reopened_at timestamptz,
  reopened_by_user_id text,
  close_reason text,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, period_type, period_key)
);

create table if not exists eazinvoice_accounting_period_history (
  id text primary key,
  business_id text not null,
  accounting_period_id text not null,
  action text not null,
  previous_status text,
  next_status text,
  actor_user_id text,
  reason text,
  readiness_status text,
  created_at timestamptz not null default now()
);

create table if not exists eazinvoice_opening_balance_sets (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  cutover_date date not null,
  status text not null default 'posted',
  idempotency_key text,
  notes text,
  immutable boolean not null default true,
  created_by_user_id text,
  journal_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, cutover_date, status)
);

create table if not exists eazinvoice_opening_balance_details (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  opening_balance_set_id text not null,
  detail_type text not null,
  customer_id text,
  vendor_id text,
  amount numeric(14,2) not null default 0,
  due_date date,
  reference text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_accounting_periods_business_dates on eazinvoice_accounting_periods (business_id, start_date, end_date);
create index if not exists idx_accounting_periods_status on eazinvoice_accounting_periods (business_id, status);
create index if not exists idx_accounting_period_history_period on eazinvoice_accounting_period_history (business_id, accounting_period_id, created_at);
create index if not exists idx_opening_balance_sets_business_cutover on eazinvoice_opening_balance_sets (business_id, cutover_date, status);
create index if not exists idx_opening_balance_details_business_type on eazinvoice_opening_balance_details (business_id, detail_type, opening_balance_set_id);
create index if not exists idx_accounting_journals_business_date on eazinvoice_accounting_journals (business_id, journal_date);
create index if not exists idx_ledger_accounts_balance_sheet_category on eazinvoice_ledger_accounts (business_id, balance_sheet_category);
