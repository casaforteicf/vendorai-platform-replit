-- CRM: participantes flexíveis por negócio (#3099)
CREATE TABLE IF NOT EXISTS crm_deal_people (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  deal_id text NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  person_id text NOT NULL REFERENCES crm_people_master(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'outro',
  is_primary boolean NOT NULL DEFAULT false,
  contextual_company_id text REFERENCES crm_companies_master(id) ON DELETE SET NULL,
  relationship_scope text NOT NULL DEFAULT 'deal_only',
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_deal_people_deal_person_uidx ON crm_deal_people(deal_id, person_id);
CREATE INDEX IF NOT EXISTS crm_deal_people_tenant_deal_idx ON crm_deal_people(tenant_id, deal_id);

CREATE TABLE IF NOT EXISTS crm_deal_companies (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  deal_id text NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  company_id text NOT NULL REFERENCES crm_companies_master(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'outra',
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_deal_companies_deal_company_uidx ON crm_deal_companies(deal_id, company_id);
CREATE INDEX IF NOT EXISTS crm_deal_companies_tenant_deal_idx ON crm_deal_companies(tenant_id, deal_id);
