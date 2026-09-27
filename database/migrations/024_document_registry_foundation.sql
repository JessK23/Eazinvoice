BEGIN;

CREATE TABLE IF NOT EXISTS eazinvoice_documents (
  id text PRIMARY KEY,
  owner_user_id text,
  business_id text NOT NULL,
  classification text NOT NULL,
  related_entity_type text,
  related_entity_id text,
  storage_provider text NOT NULL,
  storage_key text NOT NULL,
  original_filename text,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  checksum_sha256 text,
  status text NOT NULL DEFAULT 'pending_storage',
  retention_class text,
  security_class text,
  created_by_user_id text,
  idempotency_key text,
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eazinvoice_documents_size_non_negative CHECK (size_bytes >= 0),
  CONSTRAINT eazinvoice_documents_status_valid CHECK (status IN ('pending_storage', 'available', 'missing', 'quarantined', 'archived'))
);

CREATE INDEX IF NOT EXISTS eazinvoice_documents_business_idx
  ON eazinvoice_documents (business_id, classification, status);

CREATE INDEX IF NOT EXISTS eazinvoice_documents_owner_idx
  ON eazinvoice_documents (owner_user_id, status);

CREATE INDEX IF NOT EXISTS eazinvoice_documents_related_idx
  ON eazinvoice_documents (business_id, related_entity_type, related_entity_id);

CREATE INDEX IF NOT EXISTS eazinvoice_documents_storage_idx
  ON eazinvoice_documents (storage_provider, storage_key);

CREATE UNIQUE INDEX IF NOT EXISTS eazinvoice_documents_business_idempotency_idx
  ON eazinvoice_documents (business_id, owner_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

INSERT INTO eazinvoice_migrations (migration_name)
VALUES ('024_document_registry_foundation')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;
