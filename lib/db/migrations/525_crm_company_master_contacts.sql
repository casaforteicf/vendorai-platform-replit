CREATE TABLE IF NOT EXISTS crm_companies_master (
  id text PRIMARY KEY,
  cnpj text NOT NULL,
  razao_social text,
  nome_fantasia text,
  situacao_cadastral text,
  natureza_juridica text,
  porte text,
  capital_social numeric(18,2),
  data_abertura text,
  cnae_principal text,
  cnaes_secundarios jsonb DEFAULT '[]'::jsonb,
  endereco jsonb,
  telefone text,
  email text,
  website text,
  social_profiles jsonb DEFAULT '{}'::jsonb,
  enrichment_data jsonb DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'manual',
  enriched_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_companies_master_cnpj_uidx ON crm_companies_master(cnpj);
CREATE INDEX IF NOT EXISTS crm_companies_master_razao_social_idx ON crm_companies_master(razao_social);

CREATE TABLE IF NOT EXISTS crm_people_master (
  id text PRIMARY KEY,
  nome text NOT NULL,
  documento text,
  data_nascimento text,
  telefones jsonb DEFAULT '[]'::jsonb,
  emails jsonb DEFAULT '[]'::jsonb,
  social_profiles jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_people_master_documento_idx ON crm_people_master(documento);
CREATE INDEX IF NOT EXISTS crm_people_master_nome_idx ON crm_people_master(nome);

CREATE TABLE IF NOT EXISTS crm_company_people (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES crm_companies_master(id) ON DELETE CASCADE,
  person_id text NOT NULL REFERENCES crm_people_master(id) ON DELETE CASCADE,
  cargo text,
  qualificacao text,
  participacao numeric(7,4),
  is_legal_representative boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_company_people_company_person_uidx ON crm_company_people(company_id, person_id);
CREATE INDEX IF NOT EXISTS crm_company_people_company_idx ON crm_company_people(company_id);

CREATE TABLE IF NOT EXISTS crm_tenant_companies (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id text NOT NULL REFERENCES crm_companies_master(id) ON DELETE CASCADE,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  relationship_type text NOT NULL DEFAULT 'lead',
  status text NOT NULL DEFAULT 'ativo',
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_tenant_companies_tenant_company_uidx ON crm_tenant_companies(tenant_id, company_id);
CREATE INDEX IF NOT EXISTS crm_tenant_companies_tenant_lead_idx ON crm_tenant_companies(tenant_id, lead_id);

CREATE TABLE IF NOT EXISTS crm_tenant_company_contacts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tenant_company_id text NOT NULL REFERENCES crm_tenant_companies(id) ON DELETE CASCADE,
  person_id text NOT NULL REFERENCES crm_people_master(id) ON DELETE CASCADE,
  roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_primary boolean NOT NULL DEFAULT false,
  preferred_channel text,
  priority_by_purpose jsonb DEFAULT '{}'::jsonb,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_tenant_company_contacts_tc_person_uidx ON crm_tenant_company_contacts(tenant_company_id, person_id);
CREATE INDEX IF NOT EXISTS crm_tenant_company_contacts_tenant_idx ON crm_tenant_company_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS crm_tenant_company_contacts_company_idx ON crm_tenant_company_contacts(tenant_company_id);