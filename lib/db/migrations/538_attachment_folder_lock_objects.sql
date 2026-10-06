CREATE TABLE IF NOT EXISTS attachment_folder_lock_objects (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  lock_id text NOT NULL REFERENCES attachment_folder_locks(id) ON DELETE CASCADE,
  folder_path text NOT NULL,
  object_path text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT attachment_folder_lock_objects_unique UNIQUE (tenant_id, lock_id, object_path)
);

CREATE INDEX IF NOT EXISTS attachment_folder_lock_objects_object_idx
  ON attachment_folder_lock_objects (tenant_id, object_path);
