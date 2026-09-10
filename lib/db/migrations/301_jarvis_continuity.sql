CREATE TABLE IF NOT EXISTS jarvis_continuity (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  conversation_id TEXT,
  subject TEXT NOT NULL,
  last_user_message TEXT NOT NULL,
  last_assistant_response TEXT,
  route TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS jarvis_continuity_tenant_user_uidx
  ON jarvis_continuity(tenant_id, user_id);

CREATE INDEX IF NOT EXISTS jarvis_continuity_tenant_updated_idx
  ON jarvis_continuity(tenant_id, updated_at);
