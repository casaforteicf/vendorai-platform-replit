-- Revenue Scout Industry Pack: Seguros Corporativos
-- Fundação tenant-scoped para perfil, catálogo, matriz conta x produto e sinistros.

CREATE TABLE IF NOT EXISTS insurance_account_profiles (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  cnae text,
  setor text,
  porte text,
  headcount integer,
  quantidade_frota integer,
  patrimonio_declarado numeric(16,2),
  operacao_risco_elevado boolean NOT NULL DEFAULT false,
  dados_confirmados_em timestamp,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS insurance_account_profiles_tenant_account_uidx ON insurance_account_profiles(tenant_id, account_id);
CREATE INDEX IF NOT EXISTS insurance_account_profiles_tenant_sector_idx ON insurance_account_profiles(tenant_id, setor);

CREATE TABLE IF NOT EXISTS insurance_products (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  default_term_days integer NOT NULL DEFAULT 365,
  renewal_lead_days integer NOT NULL DEFAULT 90,
  target_profile jsonb,
  correlated_product_codes jsonb,
  communication jsonb,
  health_sensitive boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS insurance_products_tenant_code_uidx ON insurance_products(tenant_id, code);

CREATE TABLE IF NOT EXISTS insurance_account_product_positions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES insurance_products(id) ON DELETE RESTRICT,
  stage text NOT NULL DEFAULT 'whitespace',
  policy_number text,
  insurer_name text,
  effective_from timestamp,
  effective_to timestamp,
  premium numeric(14,2),
  insured_value numeric(16,2),
  deductible numeric(14,2),
  coverage jsonb,
  profile_fit_score numeric(5,2),
  competitive_risk boolean NOT NULL DEFAULT false,
  renewal_risk boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  verified_by_user_id text,
  verified_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS insurance_positions_tenant_account_product_uidx ON insurance_account_product_positions(tenant_id, account_id, product_id);
CREATE INDEX IF NOT EXISTS insurance_positions_tenant_expiry_idx ON insurance_account_product_positions(tenant_id, effective_to);
CREATE INDEX IF NOT EXISTS insurance_positions_tenant_stage_idx ON insurance_account_product_positions(tenant_id, stage);

CREATE TABLE IF NOT EXISTS insurance_policy_claims (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  position_id text NOT NULL REFERENCES insurance_account_product_positions(id) ON DELETE CASCADE,
  claim_type text,
  occurred_at timestamp NOT NULL,
  status text NOT NULL DEFAULT 'aberto',
  estimated_value numeric(14,2),
  paid_value numeric(14,2),
  insurer_deadline timestamp,
  documents jsonb,
  human_escalation_required boolean NOT NULL DEFAULT false,
  closed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insurance_claims_tenant_position_idx ON insurance_policy_claims(tenant_id, position_id);
CREATE INDEX IF NOT EXISTS insurance_claims_tenant_status_idx ON insurance_policy_claims(tenant_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  insurance_account_profiles,
  insurance_products,
  insurance_account_product_positions,
  insurance_policy_claims
TO vendorai_app;

DO $
DECLARE
  table_name text;
  tenant_expression text := '(app_security.is_super_admin() OR tenant_id::text = app_security.current_tenant_id())';
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'insurance_account_profiles',
    'insurance_products',
    'insurance_account_product_positions',
    'insurance_policy_claims'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS vendorai_tenant_access ON %I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS vendorai_tenant_guard ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY vendorai_tenant_access ON %I AS PERMISSIVE FOR ALL TO vendorai_app USING (%s) WITH CHECK (%s)',
      table_name, tenant_expression, tenant_expression
    );
    EXECUTE format(
      'CREATE POLICY vendorai_tenant_guard ON %I AS RESTRICTIVE FOR ALL TO vendorai_app USING (%s) WITH CHECK (%s)',
      table_name, tenant_expression, tenant_expression
    );
  END LOOP;
END
$;
