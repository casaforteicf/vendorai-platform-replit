ALTER TABLE commerce_checkout_sessions
  ADD COLUMN IF NOT EXISTS recovery_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS recovery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_next_at timestamp,
  ADD COLUMN IF NOT EXISTS recovery_last_at timestamp,
  ADD COLUMN IF NOT EXISTS recovery_channel text,
  ADD COLUMN IF NOT EXISTS recovery_last_error text,
  ADD COLUMN IF NOT EXISTS recovered_at timestamp;

CREATE INDEX IF NOT EXISTS commerce_checkout_recovery_idx
  ON commerce_checkout_sessions (recovery_status, recovery_next_at);
