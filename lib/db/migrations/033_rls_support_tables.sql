-- 033_rls_support_tables
--
-- Reconciles the support tables that existed only in the alternate
-- 032_rls_tenant_isolation.sql branch without replacing or modifying the
-- canonical 032_rls_foundation.sql migration.
--
-- This migration is intentionally transactional and idempotent:
--   * tables and indexes are created only when absent;
--   * legacy tenant_isolation policies are removed when present;
--   * Vendor.ai foundation policies are recreated with the canonical names;
--   * vendorai_app remains NOLOGIN/NOBYPASSRLS as defined by migration 032.

CREATE TABLE IF NOT EXISTS notification_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         text        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reference_id      text        NOT NULL,
  reference_type    text        NOT NULL DEFAULT 'agendamento',
  recipient         text        NOT NULL,
  channel           text        NOT NULL,
  notification_type text        NOT NULL,
  sent_at           timestamp   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS poe_opportunities (
  id               text        PRIMARY KEY,
  tenant_id        text        NOT NULL,
  project_id       text,
  project_name     text,
  type             text        NOT NULL DEFAULT 'missing_item',
  status           text        NOT NULL DEFAULT 'detected',
  priority         integer     NOT NULL DEFAULT 5,
  title            text        NOT NULL,
  description      text,
  environment      text,
  category         text,
  item_ref         text,
  justification    text,
  technical_basis  jsonb       DEFAULT '[]',
  tags             jsonb       DEFAULT '[]',
  ai_generated     boolean     NOT NULL DEFAULT false,
  dismissed        boolean     NOT NULL DEFAULT false,
  created_at       timestamp   NOT NULL DEFAULT now(),
  updated_at       timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poe_opportunities_tenant
  ON poe_opportunities (tenant_id);
CREATE INDEX IF NOT EXISTS idx_poe_opportunities_project
  ON poe_opportunities (project_id);
CREATE INDEX IF NOT EXISTS idx_poe_opportunities_status
  ON poe_opportunities (status);

CREATE TABLE IF NOT EXISTS poe_quotation_requests (
  id              text        PRIMARY KEY,
  tenant_id       text        NOT NULL,
  project_id      text,
  project_name    text,
  items           jsonb       DEFAULT '[]',
  vcn_company_id  text,
  company_name    text,
  contact_email   text,
  contact_phone   text,
  region          text,
  deadline        timestamp,
  notes           text,
  attachments     jsonb       DEFAULT '[]',
  status          text        NOT NULL DEFAULT 'draft',
  lead_id         text,
  opportunity_id  text,
  activity_id     text,
  sent_at         timestamp,
  created_at      timestamp   NOT NULL DEFAULT now(),
  updated_at      timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poe_quot_req_tenant
  ON poe_quotation_requests (tenant_id);
CREATE INDEX IF NOT EXISTS idx_poe_quot_req_status
  ON poe_quotation_requests (status);
CREATE INDEX IF NOT EXISTS idx_poe_quot_req_company
  ON poe_quotation_requests (vcn_company_id);

CREATE TABLE IF NOT EXISTS vcn_companies (
  id                    text        PRIMARY KEY,
  type                  text        NOT NULL DEFAULT 'MANUFACTURER',
  legal_name            text        NOT NULL,
  brand_name            text,
  logo_url              text,
  cover_url             text,
  description           text,
  website               text,
  cnpj                  text,
  phone                 text,
  email                 text,
  city                  text,
  state                 text,
  country               text        DEFAULT 'BR',
  address               text,
  segments              jsonb       DEFAULT '[]',
  categories            jsonb       DEFAULT '[]',
  regions               jsonb       DEFAULT '[]',
  specialties           jsonb       DEFAULT '[]',
  tags                  jsonb       DEFAULT '[]',
  languages             jsonb       DEFAULT '["pt-BR"]',
  certification_level   text        NOT NULL DEFAULT 'official',
  certifications        jsonb       DEFAULT '[]',
  verified              boolean     NOT NULL DEFAULT false,
  featured              boolean     NOT NULL DEFAULT false,
  founded_year          integer,
  team_size             text,
  social_media          jsonb       DEFAULT '{}',
  working_hours         jsonb       DEFAULT '{}',
  status                text        NOT NULL DEFAULT 'active',
  products_count        integer     NOT NULL DEFAULT 0,
  specifications_count  integer     NOT NULL DEFAULT 0,
  quotations_count      integer     NOT NULL DEFAULT 0,
  specialists_count     integer     NOT NULL DEFAULT 0,
  tenant_id             text,
  created_at            timestamp   NOT NULL DEFAULT now(),
  updated_at            timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vcn_companies_type
  ON vcn_companies (type);
CREATE INDEX IF NOT EXISTS idx_vcn_companies_status
  ON vcn_companies (status);
CREATE INDEX IF NOT EXISTS idx_vcn_companies_cert
  ON vcn_companies (certification_level);

CREATE TABLE IF NOT EXISTS vep_companies (
  id               text        PRIMARY KEY,
  type             text        NOT NULL DEFAULT 'OTHER',
  legal_name       text        NOT NULL,
  trade_name       text,
  logo_url          text,
  cover_url         text,
  description       text,
  mission           text,
  history           text,
  website           text,
  cnpj              text,
  phone             text,
  email             text,
  city              text,
  state             text,
  country           text        DEFAULT 'BR',
  address           text,
  segments          jsonb       DEFAULT '[]',
  specialties       jsonb       DEFAULT '[]',
  regions           jsonb       DEFAULT '[]',
  languages         jsonb       DEFAULT '["pt-BR"]',
  tags              jsonb       DEFAULT '[]',
  certifications   jsonb       DEFAULT '[]',
  tier              text        NOT NULL DEFAULT 'basic',
  founded_year      integer,
  team_size         text,
  social_media      jsonb       DEFAULT '{}',
  working_hours     jsonb       DEFAULT '{}',
  status            text        NOT NULL DEFAULT 'active',
  featured          boolean     NOT NULL DEFAULT false,
  verified          boolean     NOT NULL DEFAULT false,
  followers_count   integer     NOT NULL DEFAULT 0,
  projects_count    integer     NOT NULL DEFAULT 0,
  portfolio_count   integer     NOT NULL DEFAULT 0,
  tenant_id         text,
  created_at        timestamp   NOT NULL DEFAULT now(),
  updated_at        timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vep_companies_type
  ON vep_companies (type);
CREATE INDEX IF NOT EXISTS idx_vep_companies_status
  ON vep_companies (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  notification_logs,
  poe_opportunities,
  poe_quotation_requests,
  vcn_companies,
  vep_companies
TO vendorai_app;

GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO vendorai_app;

DO $$
DECLARE
  tenant_table_name TEXT;
  tenant_expression CONSTANT TEXT :=
    '(app_security.is_super_admin() OR tenant_id::text = app_security.current_tenant_id())';
BEGIN
  FOREACH tenant_table_name IN ARRAY ARRAY[
    'notification_logs',
    'poe_opportunities',
    'poe_quotation_requests',
    'vcn_companies',
    'vep_companies'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      tenant_table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_isolation ON public.%I',
      tenant_table_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS vendorai_tenant_access ON public.%I',
      tenant_table_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS vendorai_tenant_guard ON public.%I',
      tenant_table_name
    );

    EXECUTE format(
      'CREATE POLICY vendorai_tenant_access ON public.%I AS PERMISSIVE FOR ALL TO vendorai_app USING (%s) WITH CHECK (%s)',
      tenant_table_name,
      tenant_expression,
      tenant_expression
    );

    EXECUTE format(
      'CREATE POLICY vendorai_tenant_guard ON public.%I AS RESTRICTIVE FOR ALL TO vendorai_app USING (%s) WITH CHECK (%s)',
      tenant_table_name,
      tenant_expression,
      tenant_expression
    );
  END LOOP;
END
$$;

COMMENT ON TABLE notification_logs IS
  'Tenant-scoped notification delivery log protected by Vendor.ai RLS.';
COMMENT ON TABLE poe_opportunities IS
  'Tenant-scoped POE opportunities protected by Vendor.ai RLS.';
COMMENT ON TABLE poe_quotation_requests IS
  'Tenant-scoped POE quotation requests protected by Vendor.ai RLS.';
COMMENT ON TABLE vcn_companies IS
  'Vendor Connection Network companies protected by Vendor.ai RLS.';
COMMENT ON TABLE vep_companies IS
  'Vendor Ecosystem Partner companies protected by Vendor.ai RLS.';
