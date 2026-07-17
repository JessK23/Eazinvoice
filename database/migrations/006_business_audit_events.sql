create table if not exists eazinvoice_business_audit_events (
  id text primary key,
  owner_user_id text not null,
  company_id text,
  actor_user_id text,
  actor_email text,
  actor_name text,
  actor_role text,
  workspace_role text,
  category text not null,
  action text not null,
  outcome text not null default 'info',
  target_type text,
  target_id text,
  target_label text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_audit_owner_created
  on eazinvoice_business_audit_events (owner_user_id, created_at desc);

create index if not exists idx_business_audit_category
  on eazinvoice_business_audit_events (owner_user_id, category, created_at desc);

create index if not exists idx_business_audit_target
  on eazinvoice_business_audit_events (target_type, target_id);
