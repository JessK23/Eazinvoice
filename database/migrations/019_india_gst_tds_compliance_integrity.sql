-- P1-8 India GST, TDS & Compliance Integrity
-- Forward-only schema for compliance profiles, registrations, versioned rules,
-- transaction snapshots, obligations and TDS registers.

create table if not exists eazinvoice_tax_registrations (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  tax_type text not null,
  registration_type text,
  gstin text,
  masked_gstin text,
  gstin_structurally_valid boolean not null default false,
  externally_verified boolean not null default false,
  state_code text,
  registration_state text,
  status text not null default 'active',
  primary_registration boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists eazinvoice_compliance_rule_sets (
  id text primary key,
  jurisdiction text not null,
  tax_type text not null,
  rule_key text not null,
  version text not null,
  effective_from date not null,
  effective_to date,
  config jsonb not null default '{}'::jsonb,
  authority text,
  reference text,
  source_type text not null default 'configured',
  last_verified_date date,
  status text not null default 'active',
  production_ready boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists eazinvoice_transaction_compliance_snapshots (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  tax_type text not null,
  direction text not null,
  source_type text not null,
  source_id text not null,
  document_number text,
  document_date date,
  registration_id text,
  rule_set_id text,
  rule_version text,
  rule_key text,
  classification_status text not null,
  issues jsonb not null default '[]'::jsonb,
  supplier_state text,
  recipient_state text,
  expected_gst_mode text,
  supplied_gst_mode text,
  place_of_supply text,
  b2b_b2c text,
  counterparty_gstin_masked text,
  counterparty_gstin_structurally_valid boolean not null default false,
  supply_type text,
  reverse_charge_applicable boolean not null default false,
  itc_status text,
  hsn_sac_status text,
  taxable_value numeric(14,2) not null default 0,
  cgst numeric(14,2) not null default 0,
  sgst numeric(14,2) not null default 0,
  igst numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  gross_value numeric(14,2) not null default 0,
  source_semantics text not null default 'classification_snapshot_not_filing',
  created_at timestamptz not null default now(),
  unique (business_id, tax_type, source_type, source_id)
);

create table if not exists eazinvoice_compliance_obligations (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  registration_id text,
  compliance_type text not null,
  obligation_type text not null,
  period_type text not null,
  period_key text not null,
  period_from date,
  period_to date,
  financial_year text,
  due_date date,
  rule_set_id text,
  rule_version text,
  status text not null default 'upcoming',
  filing_semantics text not null default 'manual_or_preparation_status_not_government_verified',
  externally_verified boolean not null default false,
  completion_date date,
  external_filing_reference text,
  notes text,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists eazinvoice_tds_transactions (
  id text primary key,
  business_id text not null,
  owner_user_id text,
  vendor_id text,
  source_type text not null,
  source_id text not null,
  vendor_bill_number text,
  transaction_date date,
  deduction_date date,
  nature_of_payment text,
  rule_set_id text,
  rule_version text,
  rule_reference text,
  source_metadata text,
  status text not null,
  applicability text,
  issues jsonb not null default '[]'::jsonb,
  vendor_pan_masked text,
  gross_amount numeric(14,2) not null default 0,
  amount_subject_to_tds numeric(14,2) not null default 0,
  tds_rate numeric(8,4) not null default 0,
  tds_amount numeric(14,2) not null default 0,
  net_vendor_payable numeric(14,2) not null default 0,
  period jsonb not null default '{}'::jsonb,
  filing_status text not null default 'internal_register_not_filed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, source_type, source_id)
);

create index if not exists idx_tax_registrations_business on eazinvoice_tax_registrations (business_id, tax_type, status);
create index if not exists idx_tax_registrations_gstin on eazinvoice_tax_registrations (gstin);
create index if not exists idx_compliance_rules_lookup on eazinvoice_compliance_rule_sets (jurisdiction, tax_type, rule_key, effective_from, effective_to, status);
create index if not exists idx_compliance_snapshots_business_period on eazinvoice_transaction_compliance_snapshots (business_id, tax_type, direction, document_date);
create index if not exists idx_compliance_snapshots_source on eazinvoice_transaction_compliance_snapshots (business_id, source_type, source_id);
create index if not exists idx_compliance_snapshots_status on eazinvoice_transaction_compliance_snapshots (business_id, classification_status);
create index if not exists idx_compliance_obligations_business_due on eazinvoice_compliance_obligations (business_id, compliance_type, due_date, status);
create index if not exists idx_tds_transactions_business_vendor on eazinvoice_tds_transactions (business_id, vendor_id, deduction_date);
create index if not exists idx_tds_transactions_rule on eazinvoice_tds_transactions (business_id, rule_set_id, rule_version);
