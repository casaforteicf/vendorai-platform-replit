-- Vendor Shield — antifraude, risco, reserva e defesa de chargeback.
-- Todas as decisões são tenant-scoped, auditáveis e preservam snapshots de evidência.

CREATE TABLE IF NOT EXISTS vendor_shield_configs (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  review_threshold integer NOT NULL DEFAULT 61 CHECK (review_threshold BETWEEN 1 AND 100),
  block_threshold integer NOT NULL DEFAULT 81 CHECK (block_threshold BETWEEN 1 AND 100),
  require_3ds_threshold integer NOT NULL DEFAULT 31 CHECK (require_3ds_threshold BETWEEN 1 AND 100),
  high_value_centavos bigint NOT NULL DEFAULT 300000 CHECK (high_value_centavos >= 0),
  new_vendor_reserve_bps integer NOT NULL DEFAULT 1000 CHECK (new_vendor_reserve_bps BETWEEN 0 AND 10000),
  medium_risk_reserve_bps integer NOT NULL DEFAULT 500 CHECK (medium_risk_reserve_bps BETWEEN 0 AND 10000),
  high_risk_reserve_bps integer NOT NULL DEFAULT 1500 CHECK (high_risk_reserve_bps BETWEEN 0 AND 10000),
  velocity_max_attempts_10m integer NOT NULL DEFAULT 5 CHECK (velocity_max_attempts_10m > 0),
  velocity_max_cards_24h integer NOT NULL DEFAULT 3 CHECK (velocity_max_cards_24h > 0),
  velocity_max_accounts_24h integer NOT NULL DEFAULT 3 CHECK (velocity_max_accounts_24h > 0),
  require_delivery_otp boolean NOT NULL DEFAULT true,
  require_delivery_photo boolean NOT NULL DEFAULT true,
  require_delivery_geo boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (require_3ds_threshold <= review_threshold),
  CHECK (review_threshold < block_threshold)
);

CREATE TABLE IF NOT EXISTS vendor_shield_identities (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  customer_id text,
  document_hash text,
  email_hash text,
  phone_hash text,
  device_hash text,
  ip_hash text,
  card_fingerprint text,
  trust_score integer NOT NULL DEFAULT 50 CHECK (trust_score BETWEEN 0 AND 100),
  successful_orders integer NOT NULL DEFAULT 0,
  chargebacks integer NOT NULL DEFAULT 0,
  fraud_confirmed integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS vendor_shield_identity_device_idx ON vendor_shield_identities (tenant_id,device_hash,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS vendor_shield_identity_document_idx ON vendor_shield_identities (tenant_id,document_hash,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS vendor_shield_identity_card_idx ON vendor_shield_identities (tenant_id,card_fingerprint,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS vendor_shield_assessments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id text REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  payment_intent_id text REFERENCES praca_payment_intents(id) ON DELETE SET NULL,
  identity_id text REFERENCES vendor_shield_identities(id) ON DELETE SET NULL,
  phase text NOT NULL DEFAULT 'pre_payment' CHECK (phase IN ('order','pre_payment','post_authorization','delivery','post_delivery','dispute')),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  risk_level text NOT NULL CHECK (risk_level IN ('low','medium','high','critical')),
  decision text NOT NULL CHECK (decision IN ('approve','require_3ds','review','block')),
  reserve_bps integer NOT NULL DEFAULT 0 CHECK (reserve_bps BETWEEN 0 AND 10000),
  require_3ds boolean NOT NULL DEFAULT false,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_version text NOT NULL DEFAULT 'rules-v1',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_shield_assessments_order_idx ON vendor_shield_assessments (tenant_id,order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_shield_assessments_decision_idx ON vendor_shield_assessments (tenant_id,decision,created_at DESC);

CREATE TABLE IF NOT EXISTS vendor_shield_velocity_events (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id text REFERENCES praca_pedidos(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('checkout','payment_attempt','payment_authorized','payment_failed','refund','chargeback','account_created')),
  device_hash text,
  ip_hash text,
  document_hash text,
  card_fingerprint text,
  amount_centavos bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_shield_velocity_device_idx ON vendor_shield_velocity_events (tenant_id,device_hash,occurred_at DESC);
CREATE INDEX IF NOT EXISTS vendor_shield_velocity_ip_idx ON vendor_shield_velocity_events (tenant_id,ip_hash,occurred_at DESC);
CREATE INDEX IF NOT EXISTS vendor_shield_velocity_card_idx ON vendor_shield_velocity_events (tenant_id,card_fingerprint,occurred_at DESC);

CREATE TABLE IF NOT EXISTS vendor_shield_delivery_evidence (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  event_id bigint REFERENCES praca_pedido_eventos(id) ON DELETE SET NULL,
  evidence_type text NOT NULL CHECK (evidence_type IN ('otp','photo','geolocation','signature','recipient_document','courier_identity','handoff','other')),
  storage_url text,
  evidence_hash text,
  latitude numeric,
  longitude numeric,
  recipient_name text,
  recipient_document_hash text,
  captured_by text REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_shield_delivery_evidence_order_idx ON vendor_shield_delivery_evidence (tenant_id,order_id,captured_at);

CREATE TABLE IF NOT EXISTS vendor_shield_disputes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  payment_intent_id text REFERENCES praca_payment_intents(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'asaas',
  provider_dispute_id text,
  reason_code text,
  reason text,
  amount_centavos bigint,
  status text NOT NULL DEFAULT 'alerted' CHECK (status IN ('alerted','open','evidence_ready','submitted','won','lost','refunded','closed')),
  pre_dispute boolean NOT NULL DEFAULT false,
  response_deadline timestamptz,
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,provider,provider_dispute_id)
);
CREATE INDEX IF NOT EXISTS vendor_shield_disputes_status_idx ON vendor_shield_disputes (tenant_id,status,opened_at DESC);

CREATE TABLE IF NOT EXISTS vendor_shield_audit_events (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id text REFERENCES praca_pedidos(id) ON DELETE SET NULL,
  assessment_id text REFERENCES vendor_shield_assessments(id) ON DELETE SET NULL,
  dispute_id text REFERENCES vendor_shield_disputes(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_shield_audit_idx ON vendor_shield_audit_events (tenant_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION prevent_vendor_shield_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'vendor_shield_audit_events is append-only'; END;
$$;
DROP TRIGGER IF EXISTS vendor_shield_audit_immutable ON vendor_shield_audit_events;
CREATE TRIGGER vendor_shield_audit_immutable BEFORE UPDATE OR DELETE ON vendor_shield_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_vendor_shield_audit_mutation();

ALTER TABLE vendor_shield_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_shield_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_shield_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_shield_velocity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_shield_delivery_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_shield_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_shield_audit_events ENABLE ROW LEVEL SECURITY;

DO $policies$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vendor_shield_configs','vendor_shield_identities','vendor_shield_assessments',
    'vendor_shield_velocity_events','vendor_shield_delivery_evidence','vendor_shield_disputes'
  ] LOOP
    BEGIN EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'') WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'')',
      t||'_tenant',t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $policies$;
DO $$ BEGIN CREATE POLICY vendor_shield_audit_select ON vendor_shield_audit_events FOR SELECT
USING (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY vendor_shield_audit_insert ON vendor_shield_audit_events FOR INSERT
WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
