ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS recipient_user_id text REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id text REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS notifications_tenant_recipient_idx
  ON notifications (tenant_id, recipient_user_id);

CREATE INDEX IF NOT EXISTS notifications_tenant_lead_idx
  ON notifications (tenant_id, lead_id);