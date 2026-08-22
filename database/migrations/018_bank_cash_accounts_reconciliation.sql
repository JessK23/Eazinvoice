create table if not exists eazinvoice_bank_accounts (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  ledger_account_id text not null,
  ledger_account_code text,
  account_type text not null,
  display_name text not null,
  institution_name text,
  masked_account_reference text,
  currency text not null default 'INR',
  opening_balance numeric(14, 2) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eazinvoice_bank_accounts_business_idx
  on eazinvoice_bank_accounts (business_id, status);

create index if not exists eazinvoice_bank_accounts_ledger_idx
  on eazinvoice_bank_accounts (business_id, ledger_account_id);

create table if not exists eazinvoice_bank_statement_import_batches (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  bank_account_id text not null,
  source_type text not null default 'manual',
  file_name text,
  reference text,
  imported_by_user_id text,
  status text not null default 'imported',
  line_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_count integer not null default 0,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists eazinvoice_bank_statement_batches_business_idx
  on eazinvoice_bank_statement_import_batches (business_id, bank_account_id, imported_at);

create table if not exists eazinvoice_bank_statement_lines (
  id text primary key,
  business_id text not null,
  bank_account_id text not null,
  import_batch_id text,
  transaction_date date not null,
  value_date date,
  description text,
  external_reference text,
  debit numeric(14, 2) not null default 0,
  credit numeric(14, 2) not null default 0,
  amount numeric(14, 2) not null default 0,
  direction text not null,
  currency text not null default 'INR',
  source text,
  fingerprint text not null,
  reconciliation_status text not null default 'unmatched',
  matched_amount numeric(14, 2) not null default 0,
  unmatched_amount numeric(14, 2) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, bank_account_id, fingerprint)
);

create index if not exists eazinvoice_bank_statement_lines_account_date_idx
  on eazinvoice_bank_statement_lines (business_id, bank_account_id, transaction_date);

create index if not exists eazinvoice_bank_statement_lines_reference_idx
  on eazinvoice_bank_statement_lines (business_id, bank_account_id, external_reference);

create index if not exists eazinvoice_bank_statement_lines_recon_idx
  on eazinvoice_bank_statement_lines (business_id, bank_account_id, reconciliation_status);

create table if not exists eazinvoice_bank_reconciliation_matches (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  bank_account_id text not null,
  statement_line_id text not null,
  source_type text not null,
  source_id text not null,
  journal_id text,
  journal_line_id text,
  matched_amount numeric(14, 2) not null,
  match_method text not null default 'manual',
  confidence text,
  reason text,
  status text not null default 'matched',
  matched_by_user_id text,
  matched_at timestamptz,
  unmatched_by_user_id text,
  unmatched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eazinvoice_bank_recon_matches_statement_idx
  on eazinvoice_bank_reconciliation_matches (business_id, bank_account_id, statement_line_id, status);

create index if not exists eazinvoice_bank_recon_matches_source_idx
  on eazinvoice_bank_reconciliation_matches (business_id, source_type, source_id, status);

insert into eazinvoice_migrations (migration_name)
values ('018_bank_cash_accounts_reconciliation')
on conflict (migration_name) do nothing;
