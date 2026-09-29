-- ARQDOR — RFQ packages, supplier scope and real cost control
-- Project specification -> grouped supplier RFQ -> supplier response -> confirmed cost/margin

ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS categorias jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS disciplinas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS regioes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS marcas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS prazo_medio_dias integer,
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

ALTER TABLE public.compras_obras
  ADD COLUMN IF NOT EXISTS budget_id uuid,
  ADD COLUMN IF NOT EXISTS budget_item_id uuid,
  ADD COLUMN IF NOT EXISTS spec_object_id uuid,
  ADD COLUMN IF NOT EXISTS escopo_versao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS escopo_hash text,
  ADD COLUMN IF NOT EXISTS escopo_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS valor_venda_snapshot numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_estimado_snapshot numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_confirmado numeric,
  ADD COLUMN IF NOT EXISTS cotacao_desatualizada boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.arch_rfq_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  project_id uuid,
  budget_id uuid,
  code text NOT NULL,
  title text NOT NULL,
  category text,
  discipline text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','partial','completed','cancelled')),
  scope_hash text NOT NULL,
  scope_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, obra_id, code, version)
);

CREATE TABLE IF NOT EXISTS public.arch_rfq_package_items (
  package_id uuid NOT NULL REFERENCES public.arch_rfq_packages(id) ON DELETE CASCADE,
  compra_id text NOT NULL REFERENCES public.compras_obras(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (package_id, compra_id)
);

CREATE TABLE IF NOT EXISTS public.arch_rfq_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  package_id uuid NOT NULL REFERENCES public.arch_rfq_packages(id) ON DELETE CASCADE,
  supplier_id text REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  contact_name text,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','link')),
  destination text,
  public_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','viewed','responded','accepted','rejected','expired','failed')),
  payment_terms text,
  validity_date date,
  lead_time_days integer,
  freight_value numeric NOT NULL DEFAULT 0,
  tax_value numeric NOT NULL DEFAULT 0,
  discount_value numeric NOT NULL DEFAULT 0,
  total_value numeric,
  supplier_notes text,
  response_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.arch_rfq_quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.arch_rfq_invitations(id) ON DELETE CASCADE,
  compra_id text NOT NULL REFERENCES public.compras_obras(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'un',
  unit_value numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  brand_model text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invitation_id, compra_id)
);

ALTER TABLE public.arch_rfq_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arch_rfq_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arch_rfq_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arch_rfq_quote_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.arch_rfq_packages, public.arch_rfq_package_items, public.arch_rfq_invitations, public.arch_rfq_quote_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.arch_rfq_packages, public.arch_rfq_package_items, public.arch_rfq_invitations, public.arch_rfq_quote_items TO vendorai_app;

DROP POLICY IF EXISTS vendorai_tenant_access ON public.arch_rfq_packages;
CREATE POLICY vendorai_tenant_access ON public.arch_rfq_packages FOR ALL TO vendorai_app
USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

DROP POLICY IF EXISTS vendorai_tenant_access ON public.arch_rfq_invitations;
CREATE POLICY vendorai_tenant_access ON public.arch_rfq_invitations FOR ALL TO vendorai_app
USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_arch_rfq_packages_obra ON public.arch_rfq_packages(obra_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arch_rfq_packages_budget ON public.arch_rfq_packages(budget_id, category);
CREATE INDEX IF NOT EXISTS idx_arch_rfq_items_compra ON public.arch_rfq_package_items(compra_id);
CREATE INDEX IF NOT EXISTS idx_arch_rfq_invitations_package ON public.arch_rfq_invitations(package_id, status);
CREATE INDEX IF NOT EXISTS idx_arch_rfq_quote_items_invitation ON public.arch_rfq_quote_items(invitation_id);
CREATE INDEX IF NOT EXISTS idx_fornecedores_scope ON public.fornecedores(tenant_id, ativo);
