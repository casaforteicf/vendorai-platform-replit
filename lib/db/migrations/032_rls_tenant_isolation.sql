-- no-transaction
-- 032_rls_tenant_isolation
-- Creates vendorai_app role (NOBYPASSRLS) and enables Row Level Security
-- on all 54 tables that carry tenant_id (all stored as TEXT).
-- NOTE: runs outside an explicit transaction because Supabase's internal event
-- triggers (Realtime publication updates) cause pg_class catalog visibility to
-- become stale for some tables (notably notification_logs) when many DDL
-- statements are batched in a single BEGIN/COMMIT block.
--
-- Idempotency strategy:
--   ALTER TABLE ... ENABLE ROW LEVEL SECURITY   — no-op if already enabled
--   DROP POLICY IF EXISTS / CREATE POLICY       — always recreates cleanly

-- ─── vendorai_app role ────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vendorai_app') THEN
    CREATE ROLE vendorai_app
      LOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO vendorai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vendorai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vendorai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vendorai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO vendorai_app;

-- ─── Create tables missing from Supabase (created only via drizzle-kit push) ──
-- These 5 tables were never applied via a numbered migration; they exist only in
-- the local heliumdb. We create them here idempotently before enabling RLS.

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
CREATE INDEX IF NOT EXISTS idx_poe_opportunities_tenant  ON poe_opportunities (tenant_id);
CREATE INDEX IF NOT EXISTS idx_poe_opportunities_project ON poe_opportunities (project_id);
CREATE INDEX IF NOT EXISTS idx_poe_opportunities_status  ON poe_opportunities (status);

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
CREATE INDEX IF NOT EXISTS idx_poe_quot_req_tenant  ON poe_quotation_requests (tenant_id);
CREATE INDEX IF NOT EXISTS idx_poe_quot_req_status  ON poe_quotation_requests (status);
CREATE INDEX IF NOT EXISTS idx_poe_quot_req_company ON poe_quotation_requests (vcn_company_id);

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
CREATE INDEX IF NOT EXISTS idx_vcn_companies_type   ON vcn_companies (type);
CREATE INDEX IF NOT EXISTS idx_vcn_companies_status ON vcn_companies (status);
CREATE INDEX IF NOT EXISTS idx_vcn_companies_cert   ON vcn_companies (certification_level);

CREATE TABLE IF NOT EXISTS vep_companies (
  id               text        PRIMARY KEY,
  type             text        NOT NULL DEFAULT 'OTHER',
  legal_name       text        NOT NULL,
  trade_name       text,
  logo_url         text,
  cover_url        text,
  description      text,
  mission          text,
  history          text,
  website          text,
  cnpj             text,
  phone            text,
  email            text,
  city             text,
  state            text,
  country          text        DEFAULT 'BR',
  address          text,
  segments         jsonb       DEFAULT '[]',
  specialties      jsonb       DEFAULT '[]',
  regions          jsonb       DEFAULT '[]',
  languages        jsonb       DEFAULT '["pt-BR"]',
  tags             jsonb       DEFAULT '[]',
  certifications   jsonb       DEFAULT '[]',
  tier             text        NOT NULL DEFAULT 'basic',
  founded_year     integer,
  team_size        text,
  social_media     jsonb       DEFAULT '{}',
  working_hours    jsonb       DEFAULT '{}',
  status           text        NOT NULL DEFAULT 'active',
  featured         boolean     NOT NULL DEFAULT false,
  verified         boolean     NOT NULL DEFAULT false,
  followers_count  integer     NOT NULL DEFAULT 0,
  projects_count   integer     NOT NULL DEFAULT 0,
  portfolio_count  integer     NOT NULL DEFAULT 0,
  tenant_id        text,
  created_at       timestamp   NOT NULL DEFAULT now(),
  updated_at       timestamp   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vep_companies_type   ON vep_companies (type);
CREATE INDEX IF NOT EXISTS idx_vep_companies_status ON vep_companies (status);

-- Explicit grants for the newly created tables (GRANT ON ALL TABLES ran before CREATE)
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_logs       TO vendorai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON poe_opportunities       TO vendorai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON poe_quotation_requests  TO vendorai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON vcn_companies           TO vendorai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON vep_companies           TO vendorai_app;

-- ─── Enable RLS + tenant isolation policies (54 tables) ──────────────────────
-- Pattern: ENABLE RLS (idempotent), then DROP IF EXISTS + CREATE POLICY.
-- tenant_id is TEXT in all tables; comparison is plain text equality.

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON activities;
CREATE POLICY tenant_isolation ON activities FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agendamentos;
CREATE POLICY tenant_isolation ON agendamentos FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE agent_actions_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agent_actions_log;
CREATE POLICY tenant_isolation ON agent_actions_log FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agent_configs;
CREATE POLICY tenant_isolation ON agent_configs FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agent_tasks;
CREATE POLICY tenant_isolation ON agent_tasks FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON api_usage;
CREATE POLICY tenant_isolation ON api_usage FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE arch_ai_renders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON arch_ai_renders;
CREATE POLICY tenant_isolation ON arch_ai_renders FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE arch_project_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON arch_project_configs;
CREATE POLICY tenant_isolation ON arch_project_configs FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE arch_specifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON arch_specifications;
CREATE POLICY tenant_isolation ON arch_specifications FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON business_profiles;
CREATE POLICY tenant_isolation ON business_profiles FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON campaigns;
CREATE POLICY tenant_isolation ON campaigns FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE composicoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON composicoes;
CREATE POLICY tenant_isolation ON composicoes FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE compras_obras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON compras_obras;
CREATE POLICY tenant_isolation ON compras_obras FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON consents;
CREATE POLICY tenant_isolation ON consents FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE content_studio_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON content_studio_uploads;
CREATE POLICY tenant_isolation ON content_studio_uploads FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON conversations;
CREATE POLICY tenant_isolation ON conversations FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE customer_intelligence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON customer_intelligence;
CREATE POLICY tenant_isolation ON customer_intelligence FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON deals;
CREATE POLICY tenant_isolation ON deals FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE estoque_central_obras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON estoque_central_obras;
CREATE POLICY tenant_isolation ON estoque_central_obras FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE funis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON funis;
CREATE POLICY tenant_isolation ON funis FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE insumos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON insumos;
CREATE POLICY tenant_isolation ON insumos FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON invoices;
CREATE POLICY tenant_isolation ON invoices FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON knowledge_base;
CREATE POLICY tenant_isolation ON knowledge_base FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE lead_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON lead_products;
CREATE POLICY tenant_isolation ON lead_products FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE lead_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON lead_proposals;
CREATE POLICY tenant_isolation ON lead_proposals FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON leads;
CREATE POLICY tenant_isolation ON leads FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON messages;
CREATE POLICY tenant_isolation ON messages FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE movimentacoes_estoque_obras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON movimentacoes_estoque_obras;
CREATE POLICY tenant_isolation ON movimentacoes_estoque_obras FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON notification_logs;
CREATE POLICY tenant_isolation ON notification_logs FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON notifications;
CREATE POLICY tenant_isolation ON notifications FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE obra_lancamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON obra_lancamentos;
CREATE POLICY tenant_isolation ON obra_lancamentos FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE obras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON obras;
CREATE POLICY tenant_isolation ON obras FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE poe_opportunities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON poe_opportunities;
CREATE POLICY tenant_isolation ON poe_opportunities FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE poe_quotation_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON poe_quotation_requests;
CREATE POLICY tenant_isolation ON poe_quotation_requests FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE produtos_catalogo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON produtos_catalogo;
CREATE POLICY tenant_isolation ON produtos_catalogo FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE propostas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON propostas;
CREATE POLICY tenant_isolation ON propostas FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON rules;
CREATE POLICY tenant_isolation ON rules FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE sdr_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sdr_templates;
CREATE POLICY tenant_isolation ON sdr_templates FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON subscriptions;
CREATE POLICY tenant_isolation ON subscriptions FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_domains;
CREATE POLICY tenant_isolation ON tenant_domains FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE token_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON token_purchases;
CREATE POLICY tenant_isolation ON token_purchases FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE varejo_colecoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON varejo_colecoes;
CREATE POLICY tenant_isolation ON varejo_colecoes FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE varejo_combos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON varejo_combos;
CREATE POLICY tenant_isolation ON varejo_combos FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE varejo_fidelidade ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON varejo_fidelidade;
CREATE POLICY tenant_isolation ON varejo_fidelidade FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE varejo_fornecedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON varejo_fornecedores;
CREATE POLICY tenant_isolation ON varejo_fornecedores FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE varejo_grades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON varejo_grades;
CREATE POLICY tenant_isolation ON varejo_grades FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE varejo_pedidos_compra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON varejo_pedidos_compra;
CREATE POLICY tenant_isolation ON varejo_pedidos_compra FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE varejo_produtos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON varejo_produtos;
CREATE POLICY tenant_isolation ON varejo_produtos FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE vcn_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON vcn_companies;
CREATE POLICY tenant_isolation ON vcn_companies FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE vep_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON vep_companies;
CREATE POLICY tenant_isolation ON vep_companies FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON whatsapp_connections;
CREATE POLICY tenant_isolation ON whatsapp_connections FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON whatsapp_contacts;
CREATE POLICY tenant_isolation ON whatsapp_contacts FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON whatsapp_messages;
CREATE POLICY tenant_isolation ON whatsapp_messages FOR ALL TO vendorai_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
