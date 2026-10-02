-- VendorAI — instalação operacional universal
-- Templates configuráveis + visitas + itens + ocorrências.

CREATE TABLE IF NOT EXISTS installation_checklist_templates (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  segment_key text,
  niche_key text,
  category_key text,
  product_id text,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_installation_template_scope
  ON installation_checklist_templates(tenant_id, product_id, category_key, active);

CREATE TABLE IF NOT EXISTS installation_visits (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_card_id text NOT NULL REFERENCES work_cards(id) ON DELETE CASCADE,
  visit_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'scheduled',
  scheduled_at timestamp,
  started_at timestamp,
  ended_at timestamp,
  team_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  responsible_id text REFERENCES users(id) ON DELETE SET NULL,
  receiver_name text,
  receiver_document text,
  receiver_relationship text,
  customer_acceptance_status text NOT NULL DEFAULT 'pending',
  customer_signature_url text,
  company_signature_url text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, work_card_id, visit_number)
);
CREATE INDEX IF NOT EXISTS ix_installation_visits_card
  ON installation_visits(tenant_id, work_card_id, visit_number);

CREATE TABLE IF NOT EXISTS installation_checklist_items (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  visit_id text NOT NULL REFERENCES installation_visits(id) ON DELETE CASCADE,
  work_card_id text NOT NULL REFERENCES work_cards(id) ON DELETE CASCADE,
  source_item_key text NOT NULL,
  source_item_index integer NOT NULL,
  unit_index integer,
  product_id text,
  sku text,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  location text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  observation text,
  evidence_required boolean NOT NULL DEFAULT false,
  required boolean NOT NULL DEFAULT true,
  completed_at timestamp,
  completed_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_installation_items_visit
  ON installation_checklist_items(tenant_id, visit_id, status);
CREATE INDEX IF NOT EXISTS ix_installation_items_card
  ON installation_checklist_items(tenant_id, work_card_id, source_item_index);

CREATE TABLE IF NOT EXISTS installation_occurrences (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_card_id text NOT NULL REFERENCES work_cards(id) ON DELETE CASCADE,
  visit_id text NOT NULL REFERENCES installation_visits(id) ON DELETE CASCADE,
  checklist_item_id text REFERENCES installation_checklist_items(id) ON DELETE SET NULL,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  description text,
  responsible_id text REFERENCES users(id) ON DELETE SET NULL,
  due_at timestamp,
  resolved_at timestamp,
  resolution text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_installation_occurrences_card
  ON installation_occurrences(tenant_id, work_card_id, status);
CREATE INDEX IF NOT EXISTS ix_installation_occurrences_item
  ON installation_occurrences(tenant_id, checklist_item_id, status);

ALTER TABLE installation_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE installation_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE installation_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE installation_occurrences ENABLE ROW LEVEL SECURITY;