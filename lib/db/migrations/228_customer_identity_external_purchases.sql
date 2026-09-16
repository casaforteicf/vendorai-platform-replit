-- VendorAI App Builder — identidade unificada por CPF + compras externas (ERP/PDV/e-commerce).
-- O CPF nunca vira chave primária técnica. A aplicação grava um fingerprint HMAC para matching
-- e mantém o documento cifrado somente para necessidades autorizadas.

CREATE TABLE IF NOT EXISTS customer_identity_documents (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'cpf',
  document_fingerprint text NOT NULL,
  document_ciphertext text NOT NULL,
  app_user_id text REFERENCES app_users(id) ON DELETE SET NULL,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  verified_source text NOT NULL DEFAULT 'user_provided',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_identity_documents_type_chk CHECK (document_type IN ('cpf'))
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_identity_documents_tenant_doc_uidx
  ON customer_identity_documents (tenant_id, document_type, document_fingerprint);
CREATE INDEX IF NOT EXISTS customer_identity_documents_app_user_idx
  ON customer_identity_documents (tenant_id, app_user_id)
  WHERE app_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_identity_documents_lead_idx
  ON customer_identity_documents (tenant_id, lead_id)
  WHERE lead_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS external_purchase_sources (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  name text NOT NULL,
  source_kind text NOT NULL DEFAULT 'erp',
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_purchase_sources_kind_chk CHECK (source_kind IN ('erp','pdv','ecommerce','marketplace','manual','other'))
);

CREATE UNIQUE INDEX IF NOT EXISTS external_purchase_sources_tenant_key_uidx
  ON external_purchase_sources (tenant_id, source_key);

CREATE TABLE IF NOT EXISTS external_purchases (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_id text REFERENCES external_purchase_sources(id) ON DELETE SET NULL,
  source_key text NOT NULL,
  source_kind text NOT NULL,
  external_order_id text NOT NULL,
  document_fingerprint text,
  app_user_id text REFERENCES app_users(id) ON DELETE SET NULL,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'paid',
  customer_name text,
  customer_email text,
  customer_phone text,
  store_id text,
  terminal_id text,
  seller_id text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text,
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_purchases_status_chk CHECK (status IN ('created','paid','cancelled','refunded','partially_refunded','voided'))
);

CREATE UNIQUE INDEX IF NOT EXISTS external_purchases_dedupe_uidx
  ON external_purchases (tenant_id, source_key, external_order_id);
CREATE INDEX IF NOT EXISTS external_purchases_identity_idx
  ON external_purchases (tenant_id, document_fingerprint, occurred_at DESC)
  WHERE document_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS external_purchases_app_user_idx
  ON external_purchases (tenant_id, app_user_id, occurred_at DESC)
  WHERE app_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS external_purchases_lead_idx
  ON external_purchases (tenant_id, lead_id, occurred_at DESC)
  WHERE lead_id IS NOT NULL;

-- O outbox criado na migration 227 passa a aceitar também compras originadas fora do App Product.
ALTER TABLE app_runtime_commerce_events
  ALTER COLUMN app_instance_id DROP NOT NULL,
  ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE app_runtime_commerce_events
  ADD COLUMN IF NOT EXISTS external_purchase_id text REFERENCES external_purchases(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS app_runtime_commerce_events_external_purchase_type_uidx
  ON app_runtime_commerce_events (external_purchase_id, event_type)
  WHERE external_purchase_id IS NOT NULL;

-- Eventos externos entram no mesmo pipeline de ERP/financeiro/fiscal/CRM/CI/automação.
CREATE OR REPLACE FUNCTION emit_external_purchase_event()
RETURNS trigger AS $$
DECLARE
  next_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    next_event := 'commerce.external_purchase.created';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    next_event := 'commerce.external_purchase.' || NEW.status;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO app_runtime_commerce_events (
    tenant_id, app_instance_id, app_user_id, order_id, external_purchase_id, event_type, payload
  ) VALUES (
    NEW.tenant_id,
    NULL,
    NEW.app_user_id,
    NULL,
    NEW.id,
    next_event,
    jsonb_build_object(
      'externalPurchaseId', NEW.id,
      'externalOrderId', NEW.external_order_id,
      'status', NEW.status,
      'sourceKey', NEW.source_key,
      'sourceKind', NEW.source_kind,
      'total', NEW.total,
      'items', NEW.items,
      'storeId', NEW.store_id,
      'occurredAt', NEW.occurred_at
    )
  )
  ON CONFLICT (external_purchase_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emit_external_purchase_event ON external_purchases;
CREATE TRIGGER trg_emit_external_purchase_event
AFTER INSERT OR UPDATE OF status ON external_purchases
FOR EACH ROW
EXECUTE FUNCTION emit_external_purchase_event();

-- Ação explícita do App User para vincular o próprio CPF à identidade do tenant.
INSERT INTO app_action_registry (
  id, key, name, description, category, input_schema, output_schema,
  executor_key, required_permissions, risk_level, status, metadata
)
VALUES (
  gen_random_uuid()::text,
  'viewer.identity.cpf.link',
  'Vincular CPF do usuário',
  'Associa o CPF informado pelo próprio App User à identidade unificada do tenant e reclama compras externas pendentes do mesmo CPF.',
  'identity',
  '{"type":"object","properties":{"cpf":{"type":"string","minLength":11,"maxLength":18}},"required":["cpf"],"additionalProperties":false}'::jsonb,
  '{"type":"object","properties":{"linked":{"type":"boolean"},"claimedPurchases":{"type":"integer"},"maskedCpf":{"type":"string"}}}'::jsonb,
  'viewer.identity.cpf.link',
  '[]'::jsonb,
  'medium',
  'active',
  '{"sensitive":true,"explicitUserAction":true,"purpose":"purchase_identity"}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  executor_key = EXCLUDED.executor_key,
  required_permissions = EXCLUDED.required_permissions,
  risk_level = EXCLUDED.risk_level,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = now();
