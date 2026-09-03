-- Management metadata for reusable tenant-scoped user functions.

ALTER TABLE tenant_user_functions
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE tenant_user_functions
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
