CREATE TABLE IF NOT EXISTS commerce_users (
  id uuid PRIMARY KEY,
  subject text NOT NULL UNIQUE,
  email text NOT NULL
);

CREATE TABLE IF NOT EXISTS commerce_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES commerce_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS commerce_sessions_expiry ON commerce_sessions(expires_at);

CREATE TABLE IF NOT EXISTS compatibility_orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES commerce_users(id),
  request_id uuid NOT NULL,
  birth_a jsonb NOT NULL,
  birth_b jsonb NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('stripe', 'local')),
  stripe_session text UNIQUE,
  payment_intent text UNIQUE,
  stripe_refund text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunding', 'refunded', 'expired')),
  report jsonb,
  followups jsonb NOT NULL DEFAULT '[]',
  task_token uuid,
  task_until timestamptz,
  generation_failed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  UNIQUE (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS compatibility_orders_by_user ON compatibility_orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce_operator_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES compatibility_orders(id),
  operator_id uuid NOT NULL REFERENCES commerce_users(id),
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
