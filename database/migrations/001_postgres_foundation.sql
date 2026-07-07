BEGIN;

CREATE TABLE IF NOT EXISTS eazinvoice_migrations (
  id bigserial PRIMARY KEY,
  migration_name text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eazinvoice_legacy_snapshots (
  id bigserial PRIMARY KEY,
  source text NOT NULL DEFAULT 'json',
  source_path text NOT NULL DEFAULT '',
  snapshot jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eazinvoice_records (
  id text PRIMARY KEY,
  record_type text NOT NULL,
  owner_user_id text,
  company_id text,
  status text NOT NULL DEFAULT 'active',
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_records_type_idx
  ON eazinvoice_records (record_type);

CREATE INDEX IF NOT EXISTS eazinvoice_records_owner_idx
  ON eazinvoice_records (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_records_company_idx
  ON eazinvoice_records (company_id);

CREATE INDEX IF NOT EXISTS eazinvoice_records_record_gin_idx
  ON eazinvoice_records USING gin (record);

CREATE TABLE IF NOT EXISTS eazinvoice_audit_events (
  id bigserial PRIMARY KEY,
  actor_user_id text,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_audit_events_entity_idx
  ON eazinvoice_audit_events (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS eazinvoice_audit_events_actor_idx
  ON eazinvoice_audit_events (actor_user_id);

INSERT INTO eazinvoice_migrations (migration_name)
VALUES ('001_postgres_foundation')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;
