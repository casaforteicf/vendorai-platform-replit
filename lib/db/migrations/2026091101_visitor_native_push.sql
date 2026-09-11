CREATE TABLE IF NOT EXISTS mobile_push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  expo_push_token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'unknown',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mobile_push_devices_tenant_active
  ON mobile_push_devices (tenant_id, active);

CREATE INDEX IF NOT EXISTS idx_mobile_push_devices_user
  ON mobile_push_devices (user_id);

CREATE TABLE IF NOT EXISTS visitor_push_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  anonymous_session_id text NOT NULL,
  kind text NOT NULL DEFAULT 'visitor_online',
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (tenant_id, anonymous_session_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_visitor_push_alerts_created_at
  ON visitor_push_alerts (created_at DESC);
