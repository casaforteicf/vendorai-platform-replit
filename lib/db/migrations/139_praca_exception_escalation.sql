-- Escalonamento e comprovação de alertas da Central Executiva Praça.ai.
ALTER TABLE praca_exception_config
  ADD COLUMN IF NOT EXISTS escalonamento_minutos integer NOT NULL DEFAULT 30
    CHECK (escalonamento_minutos BETWEEN 5 AND 1440);

CREATE TABLE IF NOT EXISTS praca_exception_alerts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  incident_id text NOT NULL REFERENCES praca_exception_incidents(id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  alert_level text NOT NULL CHECK (alert_level IN ('inicial','fora_sla','critico')),
  channel text NOT NULL DEFAULT 'vendorai' CHECK (channel IN ('vendorai')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by text REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (incident_id,user_id,alert_level)
);

CREATE INDEX IF NOT EXISTS praca_exception_alerts_user_idx
  ON praca_exception_alerts (tenant_id,user_id,acknowledged_at,sent_at DESC);
CREATE INDEX IF NOT EXISTS praca_exception_alerts_incident_idx
  ON praca_exception_alerts (incident_id,sent_at);

CREATE TABLE IF NOT EXISTS praca_exception_dispatches (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  incident_id text NOT NULL REFERENCES praca_exception_incidents(id) ON DELETE RESTRICT,
  alert_level text NOT NULL CHECK (alert_level IN ('inicial','fora_sla','critico')),
  notification_id uuid REFERENCES notifications(id) ON DELETE SET NULL,
  recipients integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id,alert_level)
);

ALTER TABLE praca_exception_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_exception_dispatches ENABLE ROW LEVEL SECURITY;
DO $policies$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['praca_exception_alerts','praca_exception_dispatches'] LOOP
    BEGIN EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'') WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'')',
      t||'_tenant',t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $policies$;
