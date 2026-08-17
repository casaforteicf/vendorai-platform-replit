ALTER TABLE users
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT NULL;

COMMENT ON COLUMN users.permissions IS
  'Explicit module allowlist. NULL uses defaults based on user_function; [] grants no optional modules.';
