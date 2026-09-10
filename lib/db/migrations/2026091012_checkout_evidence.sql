ALTER TABLE commerce_checkout_sessions
  ADD COLUMN IF NOT EXISTS terms_version text NOT NULL DEFAULT 'checkout-legal-v1-2026-09-10',
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamp NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS commerce_checkout_terms_idx
  ON commerce_checkout_sessions (terms_version, terms_accepted_at);
