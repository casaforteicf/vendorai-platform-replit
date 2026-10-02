ALTER TABLE crm_tenant_company_contacts
  ADD COLUMN IF NOT EXISTS role_evidence jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS role_confidence numeric(5,2),
  ADD COLUMN IF NOT EXISTS verified_at timestamp,
  ADD COLUMN IF NOT EXISTS valid_until timestamp;

CREATE TABLE IF NOT EXISTS crm_company_relationships (
  id text PRIMARY KEY,
  parent_company_id text NOT NULL REFERENCES crm_companies_master(id) ON DELETE CASCADE,
  child_company_id text NOT NULL REFERENCES crm_companies_master(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  confidence numeric(5,2),
  verified_at timestamp,
  valid_until timestamp,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_company_relationships_parent_child_type_uidx
  ON crm_company_relationships(parent_company_id, child_company_id, relationship_type);
CREATE INDEX IF NOT EXISTS crm_company_relationships_parent_idx
  ON crm_company_relationships(parent_company_id);
CREATE INDEX IF NOT EXISTS crm_company_relationships_child_idx
  ON crm_company_relationships(child_company_id);