CREATE TABLE IF NOT EXISTS platform_cost_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  provider TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_usd NUMERIC(14, 6) NOT NULL CHECK (amount_usd >= 0),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  tenant_id TEXT NULL REFERENCES tenants(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  external_reference TEXT NULL,
  note TEXT NULL,
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_cost_entries_period_check CHECK (period_end >= period_start),
  CONSTRAINT platform_cost_entries_source_check CHECK (source IN ('manual', 'api', 'import'))
);

CREATE INDEX IF NOT EXISTS idx_platform_cost_entries_period
  ON platform_cost_entries(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_platform_cost_entries_provider
  ON platform_cost_entries(provider);
CREATE INDEX IF NOT EXISTS idx_platform_cost_entries_tenant
  ON platform_cost_entries(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_cost_entries_external_reference
  ON platform_cost_entries(provider, external_reference)
  WHERE external_reference IS NOT NULL;
