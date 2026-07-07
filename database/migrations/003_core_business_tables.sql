BEGIN;

CREATE TABLE IF NOT EXISTS eazinvoice_users (
  id text PRIMARY KEY,
  email text,
  name text,
  phone text,
  subscriber_type text,
  account_status text NOT NULL DEFAULT 'active',
  email_verified boolean NOT NULL DEFAULT false,
  mobile_verified boolean NOT NULL DEFAULT false,
  is_admin boolean NOT NULL DEFAULT false,
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_users_email_idx
  ON eazinvoice_users (lower(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE INDEX IF NOT EXISTS eazinvoice_users_subscriber_type_idx
  ON eazinvoice_users (subscriber_type);

CREATE TABLE IF NOT EXISTS eazinvoice_business_profiles (
  id text PRIMARY KEY,
  owner_user_id text,
  company_code text,
  entity_type text,
  name text,
  legal_name text,
  business_type text,
  gst_registered boolean NOT NULL DEFAULT false,
  gst_number text,
  pan_number text,
  kyc_status text,
  status text NOT NULL DEFAULT 'active',
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_business_profiles_owner_idx
  ON eazinvoice_business_profiles (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_business_profiles_status_idx
  ON eazinvoice_business_profiles (status);

CREATE TABLE IF NOT EXISTS eazinvoice_customers (
  id text PRIMARY KEY,
  owner_user_id text,
  company_id text,
  customer_code text,
  customer_type text,
  name text,
  business_name text,
  email text,
  phone text,
  gst_number text,
  pan_number text,
  status text NOT NULL DEFAULT 'active',
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_customers_owner_idx
  ON eazinvoice_customers (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_customers_company_idx
  ON eazinvoice_customers (company_id);

CREATE INDEX IF NOT EXISTS eazinvoice_customers_status_idx
  ON eazinvoice_customers (status);

CREATE TABLE IF NOT EXISTS eazinvoice_invoices (
  id text PRIMARY KEY,
  owner_user_id text,
  company_id text,
  customer_id text,
  invoice_number text,
  invoice_date date,
  due_date date,
  currency text,
  status text NOT NULL DEFAULT 'draft',
  payment_status text NOT NULL DEFAULT 'unpaid',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  balance_amount numeric(14,2) NOT NULL DEFAULT 0,
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_invoices_owner_idx
  ON eazinvoice_invoices (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_invoices_company_idx
  ON eazinvoice_invoices (company_id);

CREATE INDEX IF NOT EXISTS eazinvoice_invoices_customer_idx
  ON eazinvoice_invoices (customer_id);

CREATE INDEX IF NOT EXISTS eazinvoice_invoices_status_idx
  ON eazinvoice_invoices (status, payment_status);

CREATE INDEX IF NOT EXISTS eazinvoice_invoices_date_idx
  ON eazinvoice_invoices (invoice_date);

CREATE TABLE IF NOT EXISTS eazinvoice_invoice_items (
  line_id text PRIMARY KEY,
  invoice_id text NOT NULL,
  item_index integer NOT NULL DEFAULT 0,
  item_name text,
  hsn_sac text,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  rate numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  gst_rate numeric(7,3) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_invoice_items_invoice_idx
  ON eazinvoice_invoice_items (invoice_id, item_index);

CREATE TABLE IF NOT EXISTS eazinvoice_purchase_orders (
  id text PRIMARY KEY,
  owner_user_id text,
  company_id text,
  vendor_id text,
  document_type text NOT NULL DEFAULT 'po',
  po_number text,
  po_date date,
  due_date date,
  currency text,
  status text NOT NULL DEFAULT 'draft',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_purchase_orders_owner_idx
  ON eazinvoice_purchase_orders (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_purchase_orders_company_idx
  ON eazinvoice_purchase_orders (company_id);

CREATE INDEX IF NOT EXISTS eazinvoice_purchase_orders_status_idx
  ON eazinvoice_purchase_orders (status);

CREATE INDEX IF NOT EXISTS eazinvoice_purchase_orders_date_idx
  ON eazinvoice_purchase_orders (po_date);

CREATE TABLE IF NOT EXISTS eazinvoice_purchase_order_items (
  line_id text PRIMARY KEY,
  purchase_order_id text NOT NULL,
  item_index integer NOT NULL DEFAULT 0,
  item_name text,
  hsn_sac text,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  rate numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  gst_rate numeric(7,3) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_purchase_order_items_po_idx
  ON eazinvoice_purchase_order_items (purchase_order_id, item_index);

CREATE TABLE IF NOT EXISTS eazinvoice_payments (
  id text PRIMARY KEY,
  owner_user_id text,
  invoice_id text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text,
  mode text,
  reference text,
  payment_date date,
  status text NOT NULL DEFAULT 'recorded',
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_payments_owner_idx
  ON eazinvoice_payments (owner_user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_payments_invoice_idx
  ON eazinvoice_payments (invoice_id);

CREATE INDEX IF NOT EXISTS eazinvoice_payments_date_idx
  ON eazinvoice_payments (payment_date);

CREATE TABLE IF NOT EXISTS eazinvoice_subscriptions (
  id text PRIMARY KEY,
  user_id text,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  monthly_amount numeric(14,2) NOT NULL DEFAULT 0,
  annual_amount numeric(14,2) NOT NULL DEFAULT 0,
  billing_cycle text NOT NULL DEFAULT 'yearly',
  gateway text,
  gateway_order_id text,
  gateway_payment_id text,
  starts_at timestamptz,
  expires_at timestamptz,
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eazinvoice_subscriptions_user_idx
  ON eazinvoice_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS eazinvoice_subscriptions_plan_status_idx
  ON eazinvoice_subscriptions (plan, status);

INSERT INTO eazinvoice_migrations (migration_name)
VALUES ('003_core_business_tables')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;
