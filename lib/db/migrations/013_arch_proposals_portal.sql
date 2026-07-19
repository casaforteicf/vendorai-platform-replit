-- Sprint 032 — Client Portal Approval & Proposal Delivery
CREATE TABLE IF NOT EXISTS arch_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  project_id UUID NOT NULL,
  budget_id UUID NOT NULL,
  portal_token TEXT NULL UNIQUE,
  title TEXT NOT NULL,
  client_name TEXT NULL,
  client_email TEXT NULL,
  client_phone TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  subtotal_material NUMERIC NOT NULL DEFAULT 0,
  subtotal_labor NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_total NUMERIC NOT NULL DEFAULT 0,
  grand_total NUMERIC NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NULL,
  sent_at TIMESTAMPTZ NULL,
  viewed_at TIMESTAMPTZ NULL,
  approved_at TIMESTAMPTZ NULL,
  rejected_at TIMESTAMPTZ NULL,
  client_notes TEXT NULL,
  internal_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS arch_proposal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES arch_proposals(id) ON DELETE CASCADE,
  budget_item_id UUID NULL,
  spec_object_id UUID NULL,
  item TEXT NOT NULL,
  description TEXT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'un',
  material_value NUMERIC NOT NULL DEFAULT 0,
  labor_value NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  visible_to_client BOOLEAN NOT NULL DEFAULT TRUE,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  client_comment TEXT NULL,
  approved_at TIMESTAMPTZ NULL,
  rejected_at TIMESTAMPTZ NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arch_proposal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES arch_proposals(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_name TEXT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arch_proposal_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES arch_proposals(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  destination TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT NULL,
  sent_at TIMESTAMPTZ NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arch_proposals_tenant              ON arch_proposals (tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_proposals_project             ON arch_proposals (project_id);
CREATE INDEX IF NOT EXISTS idx_arch_proposals_budget              ON arch_proposals (budget_id);
CREATE INDEX IF NOT EXISTS idx_arch_proposals_token               ON arch_proposals (portal_token);
CREATE INDEX IF NOT EXISTS idx_arch_proposal_items_proposal       ON arch_proposal_items (proposal_id);
CREATE INDEX IF NOT EXISTS idx_arch_proposal_events_proposal      ON arch_proposal_events (proposal_id);
CREATE INDEX IF NOT EXISTS idx_arch_proposal_deliveries_proposal  ON arch_proposal_deliveries (proposal_id);
