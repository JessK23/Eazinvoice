create table if not exists eazinvoice_credit_notes (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  source_invoice_id text not null,
  customer_id text,
  credit_note_number text not null,
  credit_note_date date not null,
  reason text,
  status text not null default 'draft',
  idempotency_key text,
  currency text not null default 'INR',
  gst_mode text,
  full_reversal boolean not null default false,
  reverses_financial_event_id text,
  reverses_journal_id text,
  amount_applied numeric(14, 2) not null default 0,
  unapplied_credit numeric(14, 2) not null default 0,
  subtotal numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  taxable_amount numeric(14, 2) not null default 0,
  cgst_amount numeric(14, 2) not null default 0,
  sgst_amount numeric(14, 2) not null default 0,
  igst_amount numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  shipping numeric(14, 2) not null default 0,
  round_off numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, credit_note_number)
);

create index if not exists eazinvoice_credit_notes_business_date_idx
  on eazinvoice_credit_notes (business_id, credit_note_date);

create index if not exists eazinvoice_credit_notes_source_invoice_idx
  on eazinvoice_credit_notes (business_id, source_invoice_id);

create unique index if not exists eazinvoice_credit_notes_idempotency_idx
  on eazinvoice_credit_notes (business_id, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

create table if not exists eazinvoice_vendor_credits (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  source_vendor_bill_id text not null,
  vendor_id text,
  vendor_credit_number text not null,
  vendor_credit_date date not null,
  reason text,
  status text not null default 'draft',
  idempotency_key text,
  currency text not null default 'INR',
  gst_mode text,
  full_reversal boolean not null default false,
  reverses_financial_event_id text,
  reverses_journal_id text,
  amount_applied numeric(14, 2) not null default 0,
  unapplied_credit numeric(14, 2) not null default 0,
  subtotal numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  taxable_amount numeric(14, 2) not null default 0,
  cgst_amount numeric(14, 2) not null default 0,
  sgst_amount numeric(14, 2) not null default 0,
  igst_amount numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  shipping numeric(14, 2) not null default 0,
  round_off numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, vendor_credit_number)
);

create index if not exists eazinvoice_vendor_credits_business_date_idx
  on eazinvoice_vendor_credits (business_id, vendor_credit_date);

create index if not exists eazinvoice_vendor_credits_source_bill_idx
  on eazinvoice_vendor_credits (business_id, source_vendor_bill_id);

create unique index if not exists eazinvoice_vendor_credits_idempotency_idx
  on eazinvoice_vendor_credits (business_id, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

alter table eazinvoice_financial_events
  add column if not exists reverses_financial_event_id text,
  add column if not exists reverses_journal_id text;

alter table eazinvoice_journal_entries
  add column if not exists corrects_document_id text,
  add column if not exists reverses_journal_id text;

insert into eazinvoice_migrations (migration_name)
values ('016_credit_notes_vendor_credits_reversals')
on conflict (migration_name) do nothing;
