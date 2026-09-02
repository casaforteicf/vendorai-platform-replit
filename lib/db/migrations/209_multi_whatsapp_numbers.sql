ALTER TABLE whatsapp_connections
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS assigned_user_id text REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS evolution_instance_name text;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS whatsapp_connection_id text REFERENCES whatsapp_connections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS whatsapp_connections_tenant_active_idx
  ON whatsapp_connections(tenant_id, status, is_default);
CREATE INDEX IF NOT EXISTS conversations_whatsapp_connection_idx
  ON conversations(whatsapp_connection_id);