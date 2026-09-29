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


-- Tenant-safe policies for relation tables.
DROP POLICY IF EXISTS vendorai_tenant_access ON public.arch_rfq_package_items;
CREATE POLICY vendorai_tenant_access ON public.arch_rfq_package_items FOR ALL TO vendorai_app
USING (EXISTS (
  SELECT 1 FROM public.arch_rfq_packages p
  WHERE p.id = package_id
    AND (app_security.is_super_admin() OR p.tenant_id = app_security.current_tenant_id())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.arch_rfq_packages p
  WHERE p.id = package_id
    AND (app_security.is_super_admin() OR p.tenant_id = app_security.current_tenant_id())
));

DROP POLICY IF EXISTS vendorai_tenant_access ON public.arch_rfq_quote_items;
CREATE POLICY vendorai_tenant_access ON public.arch_rfq_quote_items FOR ALL TO vendorai_app
USING (EXISTS (
  SELECT 1 FROM public.arch_rfq_invitations i
  WHERE i.id = invitation_id
    AND (app_security.is_super_admin() OR i.tenant_id = app_security.current_tenant_id())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.arch_rfq_invitations i
  WHERE i.id = invitation_id
    AND (app_security.is_super_admin() OR i.tenant_id = app_security.current_tenant_id())
));

-- Public supplier access is token-scoped through SECURITY DEFINER functions.
-- The browser never receives tenant credentials and cannot query procurement tables directly.
CREATE OR REPLACE FUNCTION public.arch_rfq_public_bundle(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_inv public.arch_rfq_invitations%ROWTYPE;
  v_pkg public.arch_rfq_packages%ROWTYPE;
  v_obra public.obras%ROWTYPE;
  v_items jsonb;
BEGIN
  SELECT * INTO v_inv FROM public.arch_rfq_invitations WHERE public_token = p_token LIMIT 1;
  IF v_inv.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_pkg FROM public.arch_rfq_packages WHERE id = v_inv.package_id;
  SELECT * INTO v_obra FROM public.obras WHERE id = v_pkg.obra_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'descricao', c.descricao,
    'ambiente', c.ambiente,
    'quantidade', c.quantidade,
    'unidade', c.unidade,
    'escopo_snapshot', c.escopo_snapshot,
    'escopo_versao', c.escopo_versao
  ) ORDER BY pi.sort_order), '[]'::jsonb)
    INTO v_items
    FROM public.arch_rfq_package_items pi
    JOIN public.compras_obras c ON c.id = pi.compra_id
   WHERE pi.package_id = v_pkg.id;

  RETURN jsonb_build_object(
    'invitation', to_jsonb(v_inv),
    'package', to_jsonb(v_pkg),
    'obra', jsonb_build_object('id', v_obra.id, 'nome', v_obra.nome),
    'items', v_items
  );
END $$;

CREATE OR REPLACE FUNCTION public.arch_rfq_public_mark_viewed(p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public.arch_rfq_invitations
     SET status = CASE WHEN status='sent' THEN 'viewed' ELSE status END,
         viewed_at = COALESCE(viewed_at, now()),
         updated_at = now()
   WHERE public_token = p_token
     AND status IN ('sent','viewed','responded');
END $$;

CREATE OR REPLACE FUNCTION public.arch_rfq_public_submit(p_token uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_inv public.arch_rfq_invitations%ROWTYPE;
  v_item jsonb;
  v_compra_id text;
  v_quantity numeric;
  v_unit_value numeric;
  v_items_total numeric := 0;
  v_freight numeric := GREATEST(COALESCE((p_payload->>'freight')::numeric,0),0);
  v_taxes numeric := GREATEST(COALESCE((p_payload->>'taxes')::numeric,0),0);
  v_discount numeric := GREATEST(COALESCE((p_payload->>'discount')::numeric,0),0);
  v_total numeric;
BEGIN
  SELECT * INTO v_inv FROM public.arch_rfq_invitations WHERE public_token=p_token LIMIT 1 FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Cotação não encontrada'; END IF;
  IF v_inv.status IN ('accepted','rejected','expired') THEN RAISE EXCEPTION 'Cotação encerrada'; END IF;
  IF jsonb_array_length(COALESCE(p_payload->'items','[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Informe os itens'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items')
  LOOP
    v_compra_id := v_item->>'compraId';
    IF NOT EXISTS (
      SELECT 1 FROM public.arch_rfq_package_items
       WHERE package_id=v_inv.package_id AND compra_id=v_compra_id
    ) THEN RAISE EXCEPTION 'Item fora do escopo'; END IF;

    v_quantity := GREATEST(COALESCE((v_item->>'quantity')::numeric,0),0);
    v_unit_value := GREATEST(COALESCE((v_item->>'unitValue')::numeric,0),0);
    v_items_total := v_items_total + (v_quantity * v_unit_value);

    INSERT INTO public.arch_rfq_quote_items
      (invitation_id,compra_id,quantity,unit,unit_value,total_value,brand_model,notes,created_at,updated_at)
    VALUES
      (v_inv.id,v_compra_id,v_quantity,COALESCE(NULLIF(v_item->>'unit',''),'un'),v_unit_value,v_quantity*v_unit_value,
       NULLIF(v_item->>'brandModel',''),NULLIF(v_item->>'notes',''),now(),now())
    ON CONFLICT(invitation_id,compra_id) DO UPDATE SET
      quantity=EXCLUDED.quantity,unit=EXCLUDED.unit,unit_value=EXCLUDED.unit_value,total_value=EXCLUDED.total_value,
      brand_model=EXCLUDED.brand_model,notes=EXCLUDED.notes,updated_at=now();
  END LOOP;

  v_total := GREATEST(v_items_total + v_freight + v_taxes - v_discount, 0);
  UPDATE public.arch_rfq_invitations SET
    status='responded',
    freight_value=v_freight,
    tax_value=v_taxes,
    discount_value=v_discount,
    total_value=v_total,
    lead_time_days=NULLIF(p_payload->>'leadTimeDays','')::integer,
    validity_date=NULLIF(p_payload->>'validityDate','')::date,
    payment_terms=NULLIF(p_payload->>'paymentTerms',''),
    supplier_notes=NULLIF(p_payload->>'supplierNotes',''),
    responded_at=now(),
    viewed_at=COALESCE(viewed_at,now()),
    updated_at=now()
  WHERE id=v_inv.id;

  UPDATE public.arch_rfq_packages
     SET status=CASE WHEN status='completed' THEN status ELSE 'partial' END, updated_at=now()
   WHERE id=v_inv.package_id;

  RETURN jsonb_build_object('ok',true,'total',v_total);
END $$;

REVOKE ALL ON FUNCTION public.arch_rfq_public_bundle(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arch_rfq_public_mark_viewed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arch_rfq_public_submit(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.arch_rfq_public_bundle(uuid) TO vendorai_app;
GRANT EXECUTE ON FUNCTION public.arch_rfq_public_mark_viewed(uuid) TO vendorai_app;
GRANT EXECUTE ON FUNCTION public.arch_rfq_public_submit(uuid,jsonb) TO vendorai_app;
