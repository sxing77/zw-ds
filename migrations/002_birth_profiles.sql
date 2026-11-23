CREATE TABLE IF NOT EXISTS birth_profiles (
  user_id uuid NOT NULL REFERENCES commerce_users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  form jsonb NOT NULL CHECK (jsonb_typeof(form) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
