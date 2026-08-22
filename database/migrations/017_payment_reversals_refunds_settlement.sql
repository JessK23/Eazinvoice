create table if not exists eazinvoice_payment_reversals (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  original_payment_id text not null,
  invoice_id text,
  payment_direction text not null default 'customer_payment',
  amount numeric(14, 2) not null,
  currency text not null default 'INR',
  method text,
  reference text,
  provider_reference text,
  reason text,
  status text not null default 'posted',
  reversal_date date not null,
  idempotency_key text,
  created_by_user_id text,
  reverses_financial_event_id text,
  reverses_journal_id text,
  financial_event_id text,
  journal_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eazinvoice_payment_reversals_business_date_idx
  on eazinvoice_payment_reversals (business_id, reversal_date);

create index if not exists eazinvoice_payment_reversals_original_payment_idx
  on eazinvoice_payment_reversals (business_id, original_payment_id);

create unique index if not exists eazinvoice_payment_reversals_idempotency_idx
  on eazinvoice_payment_reversals (business_id, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

create table if not exists eazinvoice_vendor_payment_reversals (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  original_payment_id text not null,
  vendor_bill_id text,
  vendor_id text,
  payment_direction text not null default 'vendor_payment',
  amount numeric(14, 2) not null,
  currency text not null default 'INR',
  method text,
  reference text,
  provider_reference text,
  reason text,
  status text not null default 'posted',
  reversal_date date not null,
  idempotency_key text,
  created_by_user_id text,
  reverses_financial_event_id text,
  reverses_journal_id text,
  financial_event_id text,
  journal_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eazinvoice_vendor_payment_reversals_business_date_idx
  on eazinvoice_vendor_payment_reversals (business_id, reversal_date);

create index if not exists eazinvoice_vendor_payment_reversals_original_payment_idx
  on eazinvoice_vendor_payment_reversals (business_id, original_payment_id);

create unique index if not exists eazinvoice_vendor_payment_reversals_idempotency_idx
  on eazinvoice_vendor_payment_reversals (business_id, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

create table if not exists eazinvoice_customer_refunds (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  customer_id text,
  source_credit_note_id text not null,
  source_invoice_id text,
  source_payment_id text,
  amount numeric(14, 2) not null,
  currency text not null default 'INR',
  method text,
  reference text,
  provider_reference text,
  reason text,
  status text not null default 'processed',
  refund_date date not null,
  idempotency_key text,
  created_by_user_id text,
  financial_event_id text,
  journal_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eazinvoice_customer_refunds_business_date_idx
  on eazinvoice_customer_refunds (business_id, refund_date);

create index if not exists eazinvoice_customer_refunds_source_credit_idx
  on eazinvoice_customer_refunds (business_id, source_credit_note_id);

create index if not exists eazinvoice_customer_refunds_customer_idx
  on eazinvoice_customer_refunds (business_id, customer_id);

create unique index if not exists eazinvoice_customer_refunds_idempotency_idx
  on eazinvoice_customer_refunds (business_id, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

create table if not exists eazinvoice_vendor_refunds (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  vendor_id text,
  source_vendor_credit_id text not null,
  source_vendor_bill_id text,
  source_vendor_payment_id text,
  amount numeric(14, 2) not null,
  currency text not null default 'INR',
  method text,
  reference text,
  provider_reference text,
  reason text,
  status text not null default 'received',
  received_date date not null,
  idempotency_key text,
  created_by_user_id text,
  financial_event_id text,
  journal_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eazinvoice_vendor_refunds_business_date_idx
  on eazinvoice_vendor_refunds (business_id, received_date);

create index if not exists eazinvoice_vendor_refunds_source_credit_idx
  on eazinvoice_vendor_refunds (business_id, source_vendor_credit_id);

create index if not exists eazinvoice_vendor_refunds_vendor_idx
  on eazinvoice_vendor_refunds (business_id, vendor_id);

create unique index if not exists eazinvoice_vendor_refunds_idempotency_idx
  on eazinvoice_vendor_refunds (business_id, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

insert into eazinvoice_migrations (migration_name)
values ('017_payment_reversals_refunds_settlement')
on conflict (migration_name) do nothing;
