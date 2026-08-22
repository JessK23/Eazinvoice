BEGIN;

ALTER TABLE eazinvoice_api_keys
  ADD COLUMN IF NOT EXISTS token_prefix text,
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS token_hash_algorithm text,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

UPDATE eazinvoice_api_keys
SET
  token_prefix = COALESCE(token_prefix, record->>'tokenPrefix'),
  token_hash = COALESCE(token_hash, record->>'tokenHash'),
  token_hash_algorithm = COALESCE(token_hash_algorithm, record->>'tokenHashAlgorithm'),
  last_used_at = COALESCE(last_used_at, NULLIF(record->>'lastUsedAt', '')::timestamptz)
WHERE record ? 'tokenHash';

CREATE INDEX IF NOT EXISTS eazinvoice_api_keys_token_prefix_idx
  ON eazinvoice_api_keys (token_prefix);

INSERT INTO eazinvoice_migrations (migration_name)
VALUES ('010_api_key_hash_hardening')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;
