CREATE TABLE IF NOT EXISTS meta_growth_daily_snapshots (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  followers INTEGER,
  reach_30d INTEGER,
  profile_visits_30d INTEGER,
  engaged_accounts_30d INTEGER,
  captured_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_growth_daily_snapshots_tenant_day_uidx
  ON meta_growth_daily_snapshots(tenant_id, snapshot_date);

CREATE INDEX IF NOT EXISTS meta_growth_daily_snapshots_tenant_captured_idx
  ON meta_growth_daily_snapshots(tenant_id, captured_at DESC);
