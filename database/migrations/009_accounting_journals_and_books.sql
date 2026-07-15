create table if not exists eazinvoice_journal_lines (
  id text primary key,
  journal_id text not null references eazinvoice_journal_entries(id) on delete cascade,
  owner_user_id text not null,
  company_id text,
  account_id text not null references eazinvoice_ledger_accounts(id),
  line_index integer not null default 1,
  description text,
  debit numeric(14, 2) not null default 0,
  credit numeric(14, 2) not null default 0,
  currency text not null default 'INR',
  record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eazinvoice_journal_lines_journal_idx
  on eazinvoice_journal_lines(journal_id);

create index if not exists eazinvoice_journal_lines_owner_account_idx
  on eazinvoice_journal_lines(owner_user_id, account_id);

insert into eazinvoice_migrations(migration_name, applied_at)
values ('009_accounting_journals_and_books', now())
on conflict (migration_name) do nothing;
