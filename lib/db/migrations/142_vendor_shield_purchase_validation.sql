-- Vendor Shield: validacao adaptativa de compra antes do pagamento/expedicao.
CREATE TABLE IF NOT EXISTS vendor_shield_validation_policies (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  first_purchase_otp boolean NOT NULL DEFAULT true,
  first_purchase_3ds_over_centavos bigint NOT NULL DEFAULT 150000 CHECK (first_purchase_3ds_over_centavos>=0),
  high_value_centavos bigint NOT NULL DEFAULT 300000 CHECK (high_value_centavos>=0),
  high_value_require_otp boolean NOT NULL DEFAULT true,
  high_value_require_3ds boolean NOT NULL DEFAULT true,
  selfie_risk_threshold integer NOT NULL DEFAULT 70 CHECK (selfie_risk_threshold BETWEEN 1 AND 100),
  document_risk_threshold integer NOT NULL DEFAULT 76 CHECK (document_risk_threshold BETWEEN 1 AND 100),
  manual_review_threshold integer NOT NULL DEFAULT 76 CHECK (manual_review_threshold BETWEEN 1 AND 100),
  block_threshold integer NOT NULL DEFAULT 90 CHECK (block_threshold BETWEEN 1 AND 100),
  require_address_confirmation boolean NOT NULL DEFAULT true,
  require_terms_acceptance boolean NOT NULL DEFAULT true,
  validation_ttl_minutes integer NOT NULL DEFAULT 30 CHECK (validation_ttl_minutes BETWEEN 5 AND 1440),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (selfie_risk_threshold<=document_risk_threshold),
  CHECK (document_risk_threshold<=block_threshold),
  CHECK (manual_review_threshold<=block_threshold)
);

CREATE TABLE IF NOT EXISTS vendor_shield_purchase_validations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  assessment_id text REFERENCES vendor_shield_assessments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','manual_review','approved','rejected','expired','cancelled')),
  risk_score integer NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  first_purchase boolean NOT NULL DEFAULT false,
  high_value boolean NOT NULL DEFAULT false,
  required_methods text[] NOT NULL DEFAULT ARRAY[]::text[],
  completed_methods text[] NOT NULL DEFAULT ARRAY[]::text[],
  failed_methods text[] NOT NULL DEFAULT ARRAY[]::text[],
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by text REFERENCES users(id) ON DELETE SET NULL,
  rejected_by text REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason text,
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_shield_purchase_validation_active_idx
ON vendor_shield_purchase_validations (tenant_id,order_id)
WHERE status IN ('pending','in_progress','manual_review');
CREATE INDEX IF NOT EXISTS vendor_shield_purchase_validation_queue_idx
ON vendor_shield_purchase_validations (tenant_id,status,risk_score DESC,created_at);

CREATE TABLE IF NOT EXISTS vendor_shield_validation_steps (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  validation_id text NOT NULL REFERENCES vendor_shield_purchase_validations(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('otp','terms','address_confirmation','3ds','selfie','identity_document','manual_review')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','submitted','verified','failed','waived','expired')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  challenge_hash text,
  provider text,
  provider_reference text,
  evidence_url text,
  evidence_hash text,
  verification_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_by text REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (validation_id,method)
);
CREATE INDEX IF NOT EXISTS vendor_shield_validation_steps_idx ON vendor_shield_validation_steps (validation_id,status,method);

CREATE TABLE IF NOT EXISTS vendor_shield_validation_events (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  validation_id text NOT NULL REFERENCES vendor_shield_purchase_validations(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  method text,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_shield_validation_events_idx ON vendor_shield_validation_events (validation_id,created_at,id);

-- Nunca armazena CVV/PAN/foto de cartao neste modulo. Selfie/documento sao apenas referencias de evidencia
-- e devem apontar para storage privado com politica de retencao adequada.
ALTER TABLE vendor_shield_validation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_shield_purchase_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_shield_validation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_shield_validation_events ENABLE ROW LEVEL SECURITY;

DO $policies$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['vendor_shield_validation_policies','vendor_shield_purchase_validations','vendor_shield_validation_steps'] LOOP
    BEGIN EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'') WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'')',
      t||'_tenant',t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $policies$;
DO $$ BEGIN CREATE POLICY vendor_shield_validation_events_select ON vendor_shield_validation_events FOR SELECT
USING (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY vendor_shield_validation_events_insert ON vendor_shield_validation_events FOR INSERT
WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION prevent_vendor_shield_validation_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'vendor_shield_validation_events is append-only'; END; $$;
DROP TRIGGER IF EXISTS vendor_shield_validation_events_immutable ON vendor_shield_validation_events;
CREATE TRIGGER vendor_shield_validation_events_immutable BEFORE UPDATE OR DELETE ON vendor_shield_validation_events
FOR EACH ROW EXECUTE FUNCTION prevent_vendor_shield_validation_event_mutation();