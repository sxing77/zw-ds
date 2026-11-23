ALTER TABLE compatibility_orders DROP CONSTRAINT IF EXISTS compatibility_orders_provider_check;
ALTER TABLE compatibility_orders ADD CONSTRAINT compatibility_orders_provider_check CHECK (provider IN ('stripe', 'waffo', 'local'));

ALTER TABLE compatibility_orders
  ADD COLUMN IF NOT EXISTS waffo_environment text,
  ADD COLUMN IF NOT EXISTS waffo_store text,
  ADD COLUMN IF NOT EXISTS waffo_product text,
  ADD COLUMN IF NOT EXISTS waffo_checkout_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS waffo_checkout_url text,
  ADD COLUMN IF NOT EXISTS waffo_checkout_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS waffo_payment_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS waffo_payment_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waffo_refund_ticket text;
