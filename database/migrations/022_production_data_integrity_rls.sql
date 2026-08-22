-- P2-1 Production Data Integrity, Postgres RLS & Deployment Hardening

begin;

create or replace function eazinvoice_current_business_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.business_id', true), '')
$$;

create or replace function eazinvoice_rls_bypass()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.rls_bypass', true), 'false') = 'true'
$$;

alter table if exists eazinvoice_records add column if not exists business_id text;
update eazinvoice_records
set business_id = coalesce(nullif(business_id, ''), nullif(company_id, ''), nullif(record->>'businessId', ''))
where business_id is null or business_id = '';
create index if not exists eazinvoice_records_business_idx
  on eazinvoice_records (business_id, record_type);

alter table if exists eazinvoice_audit_events add column if not exists business_id text;
create index if not exists eazinvoice_audit_events_business_idx
  on eazinvoice_audit_events (business_id, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'eazinvoice_business_profiles',
    'eazinvoice_customers',
    'eazinvoice_vendors',
    'eazinvoice_invoices',
    'eazinvoice_purchase_orders',
    'eazinvoice_payments',
    'eazinvoice_subscriptions',
    'eazinvoice_reports',
    'eazinvoice_team_members',
    'eazinvoice_approval_requests',
    'eazinvoice_api_keys',
    'eazinvoice_business_settings',
    'eazinvoice_compliance_tasks',
    'eazinvoice_business_audit_events',
    'eazinvoice_ledger_accounts',
    'eazinvoice_ledger_transactions',
    'eazinvoice_ledger_entries',
    'eazinvoice_journal_entries',
    'eazinvoice_journal_lines',
    'eazinvoice_financial_events',
    'eazinvoice_vendor_bills',
    'eazinvoice_credit_notes',
    'eazinvoice_vendor_credits',
    'eazinvoice_payment_reversals',
    'eazinvoice_vendor_payment_reversals',
    'eazinvoice_customer_refunds',
    'eazinvoice_vendor_refunds',
    'eazinvoice_bank_accounts',
    'eazinvoice_bank_statement_import_batches',
    'eazinvoice_bank_statement_lines',
    'eazinvoice_bank_reconciliation_matches',
    'eazinvoice_tax_registrations',
    'eazinvoice_transaction_compliance_snapshots',
    'eazinvoice_compliance_obligations',
    'eazinvoice_tds_transactions',
    'eazinvoice_accounting_periods',
    'eazinvoice_accounting_period_history',
    'eazinvoice_opening_balance_sets',
    'eazinvoice_opening_balance_details',
    'eazinvoice_financial_years',
    'eazinvoice_year_end_closes',
    'eazinvoice_year_end_close_history',
    'eazinvoice_records',
    'eazinvoice_audit_events'
  ] loop
    if to_regclass(table_name) is not null then
      execute format('alter table %I enable row level security', table_name);
      execute format('alter table %I force row level security', table_name);
      execute format('drop policy if exists eazinvoice_tenant_isolation on %I', table_name);
      execute format(
        'create policy eazinvoice_tenant_isolation on %I
         using (eazinvoice_rls_bypass() or business_id = eazinvoice_current_business_id())
         with check (eazinvoice_rls_bypass() or business_id = eazinvoice_current_business_id())',
        table_name
      );
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('eazinvoice_businesses') is not null then
    alter table eazinvoice_businesses enable row level security;
    alter table eazinvoice_businesses force row level security;
    drop policy if exists eazinvoice_business_tenant_isolation on eazinvoice_businesses;
    create policy eazinvoice_business_tenant_isolation on eazinvoice_businesses
      using (eazinvoice_rls_bypass() or id = eazinvoice_current_business_id())
      with check (eazinvoice_rls_bypass() or id = eazinvoice_current_business_id());
  end if;
end $$;

do $$
begin
  if to_regclass('eazinvoice_state_documents') is not null then
    alter table eazinvoice_state_documents enable row level security;
    alter table eazinvoice_state_documents force row level security;
    drop policy if exists eazinvoice_state_documents_service_only on eazinvoice_state_documents;
    create policy eazinvoice_state_documents_service_only on eazinvoice_state_documents
      using (eazinvoice_rls_bypass())
      with check (eazinvoice_rls_bypass());
  end if;
end $$;

create table if not exists eazinvoice_production_integrity_checks (
  id bigserial primary key,
  check_key text not null,
  status text not null,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);

insert into eazinvoice_migrations (migration_name)
values ('022_production_data_integrity_rls')
on conflict (migration_name) do nothing;

commit;
