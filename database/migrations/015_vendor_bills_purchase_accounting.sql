CREATE TABLE IF NOT EXISTS eazinvoice_vendor_bills (
  id text PRIMARY KEY,
  owner_user_id text,
  business_id text NOT NULL,
  vendor_id text,
  vendor_bill_number text,
  internal_bill_number text,
  bill_date date,
  due_date date,
  status text NOT NULL DEFAULT 'draft',
  payment_status text,
  expense_category text,
  expense_account_code text,
  currency text NOT NULL DEFAULT 'INR',
  tax_rate numeric(12, 2) DEFAULT 0,
  gst_mode text,
  subtotal numeric(14, 2) DEFAULT 0,
  discount numeric(14, 2) DEFAULT 0,
  taxable_amount numeric(14, 2) DEFAULT 0,
  tax_amount numeric(14, 2) DEFAULT 0,
  cgst_amount numeric(14, 2) DEFAULT 0,
  sgst_amount numeric(14, 2) DEFAULT 0,
  igst_amount numeric(14, 2) DEFAULT 0,
  total numeric(14, 2) DEFAULT 0,
  paid_amount numeric(14, 2) DEFAULT 0,
  balance_amount numeric(14, 2) DEFAULT 0,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS eazinvoice_vendor_bills_business_vendor_ref_idx
  ON eazinvoice_vendor_bills (business_id, vendor_id, vendor_bill_number)
  WHERE coalesce(vendor_bill_number, '') <> '';

CREATE INDEX IF NOT EXISTS eazinvoice_vendor_bills_business_bill_date_idx
  ON eazinvoice_vendor_bills (business_id, bill_date);

CREATE INDEX IF NOT EXISTS eazinvoice_vendor_bills_business_due_date_idx
  ON eazinvoice_vendor_bills (business_id, due_date);

ALTER TABLE eazinvoice_payments ADD COLUMN IF NOT EXISTS vendor_bill_id text;

CREATE INDEX IF NOT EXISTS eazinvoice_payments_business_vendor_bill_idx
  ON eazinvoice_payments (business_id, vendor_bill_id);

INSERT INTO eazinvoice_migrations (migration_name)
VALUES ('015_vendor_bills_purchase_accounting')
ON CONFLICT (migration_name) DO NOTHING;
