CREATE TABLE IF NOT EXISTS attachment_folder_locks (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  folder_path text NOT NULL,
  password_hash text NOT NULL,
  unlock_minutes integer NOT NULL DEFAULT 15,
  created_by text,
  updated_by text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT attachment_folder_locks_tenant_lead_folder_unique UNIQUE (tenant_id, lead_id, folder_path)
);

CREATE INDEX IF NOT EXISTS attachment_folder_locks_lead_idx
  ON attachment_folder_locks (tenant_id, lead_id);

CREATE TABLE IF NOT EXISTS attachment_folder_audit (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  folder_path text NOT NULL,
  actor_user_id text,
  action text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attachment_folder_audit_lead_idx
  ON attachment_folder_audit (tenant_id, lead_id, created_at DESC);
