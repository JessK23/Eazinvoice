BEGIN;

ALTER TABLE eazinvoice_users
  ADD COLUMN IF NOT EXISTS canonical_email text;

UPDATE eazinvoice_users
SET canonical_email = lower(trim(email))
WHERE canonical_email IS NULL
  AND email IS NOT NULL
  AND trim(email) <> '';

CREATE INDEX IF NOT EXISTS eazinvoice_users_canonical_email_idx
  ON eazinvoice_users (canonical_email)
  WHERE canonical_email IS NOT NULL AND canonical_email <> '';

CREATE INDEX IF NOT EXISTS eazinvoice_users_verified_canonical_email_idx
  ON eazinvoice_users (canonical_email)
  WHERE email_verified = true AND canonical_email IS NOT NULL AND canonical_email <> '';

ALTER TABLE eazinvoice_team_members
  ADD COLUMN IF NOT EXISTS canonical_email text,
  ADD COLUMN IF NOT EXISTS accepted_user_id text,
  ADD COLUMN IF NOT EXISTS identity_conflict text;

UPDATE eazinvoice_team_members
SET canonical_email = lower(trim(email))
WHERE canonical_email IS NULL
  AND email IS NOT NULL
  AND trim(email) <> '';

CREATE INDEX IF NOT EXISTS eazinvoice_team_members_owner_canonical_email_idx
  ON eazinvoice_team_members (owner_user_id, canonical_email)
  WHERE canonical_email IS NOT NULL AND canonical_email <> '';

ALTER TABLE eazinvoice_team_members
  ADD CONSTRAINT eazinvoice_team_members_role_chk
  CHECK (role IN ('owner', 'admin', 'accountant', 'viewer')) NOT VALID;

ALTER TABLE eazinvoice_team_members
  ADD CONSTRAINT eazinvoice_team_members_status_chk
  CHECK (status IN ('active', 'invited', 'removed')) NOT VALID;

INSERT INTO eazinvoice_migrations (migration_name)
VALUES ('011_identity_membership_tenant_hardening')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;
