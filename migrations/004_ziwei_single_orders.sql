ALTER TABLE compatibility_orders
  ADD COLUMN IF NOT EXISTS product_kind text NOT NULL DEFAULT 'compatibility'
    CHECK (product_kind IN ('compatibility', 'ziwei'));

ALTER TABLE compatibility_orders
  ALTER COLUMN birth_b DROP NOT NULL;
