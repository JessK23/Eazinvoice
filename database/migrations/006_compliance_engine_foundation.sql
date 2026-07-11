BEGIN;

CREATE TABLE IF NOT EXISTS eazinvoice_compliance_rules (
  id text PRIMARY KEY,
  compliance_name text NOT NULL,
  department text,
  frequency text,
  applicable_entity_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  applicable_states jsonb NOT NULL DEFAULT '[]'::jsonb,
  due_date_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  reminder_schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  penalty_information text,
  status text NOT NULL DEFAULT 'active',
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_compliance_rules_status_idx
  ON eazinvoice_compliance_rules (status);

CREATE TABLE IF NOT EXISTS eazinvoice_compliance_tasks (
  id text PRIMARY KEY,
  owner_user_id text,
  company_id text,
  compliance_rule_id text,
  compliance_name text NOT NULL,
  department text,
  frequency text,
  due_date date,
  due_date_label text,
  status text NOT NULL DEFAULT 'pending',
  responsible_person text,
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_compliance_tasks_owner_idx
  ON eazinvoice_compliance_tasks (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_compliance_tasks_company_idx
  ON eazinvoice_compliance_tasks (company_id);

CREATE INDEX IF NOT EXISTS eazinvoice_compliance_tasks_status_idx
  ON eazinvoice_compliance_tasks (status);

CREATE INDEX IF NOT EXISTS eazinvoice_compliance_tasks_due_date_idx
  ON eazinvoice_compliance_tasks (due_date);

INSERT INTO eazinvoice_migrations (migration_name)
VALUES ('006_compliance_engine_foundation')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;
