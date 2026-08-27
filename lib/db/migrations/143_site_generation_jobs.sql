CREATE TABLE IF NOT EXISTS site_generation_jobs (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'error')),
  config      JSONB NOT NULL,
  base_origin TEXT NOT NULL,
  result      JSONB,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS site_generation_jobs_tenant_created_idx
  ON site_generation_jobs (tenant_id, created_at DESC);
