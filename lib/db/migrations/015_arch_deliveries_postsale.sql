-- Sprint 034 — Post-Sale, Delivery & Customer Success
CREATE TABLE IF NOT EXISTS arch_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  project_id UUID NOT NULL,
  proposal_id UUID NULL,
  client_name TEXT NULL,
  client_email TEXT NULL,
  client_phone TEXT NULL,
  status TEXT NOT NULL DEFAULT 'not-started',
  delivery_date DATE NULL,
  accepted_at TIMESTAMPTZ NULL,
  closed_at TIMESTAMPTZ NULL,
  nps NUMERIC NULL,
  satisfaction_score NUMERIC NULL,
  summary TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS arch_delivery_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES arch_deliveries(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  category TEXT NOT NULL DEFAULT 'execution',
  label TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  responsible TEXT NULL,
  notes TEXT NULL,
  completed_at TIMESTAMPTZ NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arch_delivery_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES arch_deliveries(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  title TEXT NOT NULL,
  client_name TEXT NULL,
  content TEXT NOT NULL,
  accepted BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_by TEXT NULL,
  accepted_at TIMESTAMPTZ NULL,
  signature_url TEXT NULL,
  public_token TEXT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arch_final_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES arch_deliveries(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'other',
  title TEXT NOT NULL,
  description TEXT NULL,
  file_url TEXT NULL,
  thumbnail_url TEXT NULL,
  visible_to_client BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arch_satisfaction_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES arch_deliveries(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'not-sent',
  nps NUMERIC NULL,
  satisfaction_score NUMERIC NULL,
  comment TEXT NULL,
  client_name TEXT NULL,
  public_token TEXT NULL UNIQUE,
  sent_at TIMESTAMPTZ NULL,
  answered_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arch_testimonial_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES arch_deliveries(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  channel TEXT NOT NULL DEFAULT 'manual',
  message TEXT NOT NULL,
  testimonial TEXT NULL,
  rating NUMERIC NULL,
  received_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arch_future_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  delivery_id UUID NOT NULL REFERENCES arch_deliveries(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'identified',
  title TEXT NOT NULL,
  description TEXT NULL,
  estimated_value NUMERIC NOT NULL DEFAULT 0,
  next_action TEXT NULL,
  due_date DATE NULL,
  owner_name TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arch_post_sale_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NULL,
  project_id UUID NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_name TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arch_deliveries_tenant              ON arch_deliveries (tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_deliveries_project             ON arch_deliveries (project_id);
CREATE INDEX IF NOT EXISTS idx_arch_delivery_checklist_delivery    ON arch_delivery_checklist (delivery_id);
CREATE INDEX IF NOT EXISTS idx_arch_delivery_terms_delivery        ON arch_delivery_terms (delivery_id);
CREATE INDEX IF NOT EXISTS idx_arch_final_documents_delivery       ON arch_final_documents (delivery_id);
CREATE INDEX IF NOT EXISTS idx_arch_satisfaction_surveys_delivery  ON arch_satisfaction_surveys (delivery_id);
CREATE INDEX IF NOT EXISTS idx_arch_testimonial_requests_delivery  ON arch_testimonial_requests (delivery_id);
CREATE INDEX IF NOT EXISTS idx_arch_future_opportunities_delivery  ON arch_future_opportunities (delivery_id);
CREATE INDEX IF NOT EXISTS idx_arch_future_opportunities_tenant    ON arch_future_opportunities (tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_post_sale_events_project       ON arch_post_sale_events (project_id);
