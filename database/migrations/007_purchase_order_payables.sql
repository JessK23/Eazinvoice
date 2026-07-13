ALTER TABLE eazinvoice_purchase_orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_amount numeric(14,2) NOT NULL DEFAULT 0;

UPDATE eazinvoice_purchase_orders
SET
  payment_status = CASE
    WHEN lower(coalesce(status, '')) = 'draft' THEN 'draft'
    WHEN lower(coalesce(status, '')) = 'deleted' THEN 'deleted'
    WHEN coalesce(total, 0) <= 0 THEN 'unpaid'
    ELSE coalesce(nullif(payment_status, ''), 'unpaid')
  END,
  balance_amount = CASE
    WHEN coalesce(balance_amount, 0) = 0 AND coalesce(paid_amount, 0) = 0 THEN coalesce(total, 0)
    ELSE greatest(0, coalesce(total, 0) - coalesce(paid_amount, 0))
  END
WHERE payment_status IS NULL OR balance_amount IS NULL OR paid_amount IS NULL;

CREATE INDEX IF NOT EXISTS eazinvoice_purchase_orders_payment_status_idx
  ON eazinvoice_purchase_orders (payment_status);
