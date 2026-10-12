-- UI 2.0: ownership foundation. Do not auto-grant access to legacy calendars.
ALTER TABLE agendas ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE agendas ADD COLUMN IF NOT EXISTS sharing_mode text NOT NULL DEFAULT 'private';
ALTER TABLE agendas DROP CONSTRAINT IF EXISTS agendas_sharing_mode_check;
ALTER TABLE agendas ADD CONSTRAINT agendas_sharing_mode_check CHECK (sharing_mode IN ('private','team','tenant'));
CREATE INDEX IF NOT EXISTS agendas_tenant_owner_idx ON agendas (tenant_id, owner_user_id);
-- Existing calendars stay ownerless/private until an administrator assigns an owner.
