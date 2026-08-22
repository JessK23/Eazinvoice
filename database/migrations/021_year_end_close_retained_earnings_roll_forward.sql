-- P1-10 Year-End Close, Retained Earnings & Opening Roll-Forward

create table if not exists eazinvoice_financial_years (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  financial_year text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'open',
  close_readiness_status text,
  closed_at timestamptz,
  closed_by_user_id text,
  close_reason text,
  reopened_at timestamptz,
  reopened_by_user_id text,
  reopen_reason text,
  year_end_event_id text,
  closing_journal_id text,
  next_financial_year_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, financial_year)
);

create index if not exists idx_eazinvoice_financial_years_business
  on eazinvoice_financial_years (business_id, start_date, end_date, status);

create table if not exists eazinvoice_year_end_closes (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  financial_year_id text not null references eazinvoice_financial_years(id),
  financial_year text not null,
  start_date date not null,
  end_date date not null,
  close_date date not null,
  close_method text not null,
  retained_earnings_account_id text not null,
  closing_journal_id text,
  next_financial_year_id text,
  idempotency_key text,
  version integer not null default 1,
  status text not null default 'closed',
  closed_by_user_id text,
  close_reason text,
  readiness_status text,
  readiness_snapshot jsonb not null default '{}'::jsonb,
  calculation_snapshot jsonb not null default '{}'::jsonb,
  lineage_from_close_id text,
  reopened_at timestamptz,
  reopened_by_user_id text,
  reopen_reason text,
  reversal_journal_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_eazinvoice_year_end_closes_business_fy_active
  on eazinvoice_year_end_closes (business_id, financial_year)
  where status = 'closed';

create unique index if not exists uq_eazinvoice_year_end_closes_idempotency
  on eazinvoice_year_end_closes (business_id, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

create index if not exists idx_eazinvoice_year_end_closes_business
  on eazinvoice_year_end_closes (business_id, financial_year, version, status);

create table if not exists eazinvoice_year_end_close_history (
  id text primary key,
  business_id text not null,
  year_end_close_id text not null references eazinvoice_year_end_closes(id),
  financial_year_id text not null references eazinvoice_financial_years(id),
  action text not null,
  actor_user_id text,
  reason text,
  journal_id text,
  version integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_eazinvoice_year_end_close_history_business
  on eazinvoice_year_end_close_history (business_id, year_end_close_id, created_at);

insert into eazinvoice_migrations (migration_name)
values ('021_year_end_close_retained_earnings_roll_forward')
on conflict (migration_name) do nothing;
