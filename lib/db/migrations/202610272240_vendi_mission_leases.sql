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

-- Internal coordination data must never be exposed through the Supabase API.
ALTER TABLE vendi_mission_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vendi_mission_leases FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON vendi_mission_leases FROM %I', role_name);
    END IF;
  END LOOP;
  -- Same trusted backend access model as execution_lots. Tenant authorization
  -- remains in the API; this role is never issued to browser clients.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vendorai_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON vendi_mission_leases TO vendorai_app;
    DROP POLICY IF EXISTS vendi_lease_backend_access ON vendi_mission_leases;
    CREATE POLICY vendi_lease_backend_access ON vendi_mission_leases
      FOR ALL TO vendorai_app USING (true) WITH CHECK (true);
  END IF;
END $$;
