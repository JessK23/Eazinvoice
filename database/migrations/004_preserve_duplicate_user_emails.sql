BEGIN;

DROP INDEX IF EXISTS eazinvoice_users_email_unique_idx;

CREATE INDEX IF NOT EXISTS eazinvoice_users_email_idx
  ON eazinvoice_users (lower(email))
  WHERE email IS NOT NULL AND email <> '';

INSERT INTO eazinvoice_migrations (migration_name)
VALUES ('004_preserve_duplicate_user_emails')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;
