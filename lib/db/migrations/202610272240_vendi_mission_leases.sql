-- Per-mission execution lease. All changes require a separate migration gate.
-- Protects against concurrent retries/replans by API workers on different instances.
CREATE TABLE IF NOT EXISTS vendi_mission_leases (
  mission_id text PRIMARY KEY REFERENCES vendi_missions(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lease_token text NOT NULL,
  lease_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendi_mission_leases_expiry_idx
  ON vendi_mission_leases(lease_until);
