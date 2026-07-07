BEGIN;

CREATE TABLE IF NOT EXISTS eazinvoice_state_documents (
  state_key text PRIMARY KEY,
  state jsonb NOT NULL,
  source text NOT NULL DEFAULT 'unknown',
  source_path text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_state_documents_state_gin_idx
  ON eazinvoice_state_documents USING gin (state);

INSERT INTO eazinvoice_migrations (migration_name)
VALUES ('002_postgres_state_document')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;
