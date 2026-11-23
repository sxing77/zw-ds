ALTER TABLE commerce_users
  ADD COLUMN IF NOT EXISTS password_hash text;
