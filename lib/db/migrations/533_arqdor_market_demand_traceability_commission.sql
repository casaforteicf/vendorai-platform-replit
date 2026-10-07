-- Market Arqdor — demanda rastreável, ledger operacional e comissão configurável.
-- Cada demanda recebe um identificador único (AMD-...) que acompanha RFQ, pedido,
-- fechamento, pagamento, entrega e eventual encerramento fora do ecossistema.

CREATE TABLE IF NOT EXISTS public.arqdor_market_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('global','tenant','category','product_line','product')),
  scope_key text NULL,
  percentage numeric(5,2) NOT NULL DEFAULT 10.00 CHECK (percentage >= 0 AND percentage <= 100),
  active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  created_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arqdor_market_commission_rules_lookup_idx
  ON public.arqdor_market_commission_rules(tenant_id,scope_type,scope_key,active,priority DESC);

INSERT INTO public.arqdor_market_commission_rules
  (tenant_id,scope_type,scope_key,percentage,active,priority)
SELECT NULL,'global',NULL,10.00,true,0
WHERE NOT EXISTS (
  SELECT 1 FROM public.arqdor_market_commission_rules
  WHERE tenant_id IS NULL AND scope_type='global' AND scope_key IS NULL AND active=true
);

CREATE TABLE IF NOT EXISTS public.arqdor_market_demands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_code text NOT NULL UNIQUE,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NULL,
  obra_id text NULL,
  budget_id uuid NULL,
  origin text NOT NULL DEFAULT 'budget' CHECK (origin IN ('budget','market','manual','imported')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','quoting','partially_closed','closed_internal','closed_external','cancelled')),
  requested_by text NULL,
  title text NULL,
  estimated_value numeric(14,2) NULL,
  closed_mode text NULL CHECK (closed_mode IS NULL OR closed_mode IN ('internal','external','cancelled')),
  external_supplier_name text NULL,
  external_supplier_document text NULL,
  external_supplier_contact text NULL,
  external_close_reason text NULL,
  external_close_value numeric(14,2) NULL,
  selected_supplier_name text NULL,
  selected_supplier_id text NULL,
  commission_rule_id uuid NULL REFERENCES public.arqdor_market_commission_rules(id) ON DELETE SET NULL,
  commission_percentage numeric(5,2) NULL,
  commission_base_value numeric(14,2) NULL,
  commission_amount numeric(14,2) NULL,
  commission_status text NOT NULL DEFAULT 'pending'
    CHECK (commission_status IN ('pending','not_applicable','due','invoiced','paid','waived','disputed')),
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arqdor_market_demands_tenant_idx
  ON public.arqdor_market_demands(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS arqdor_market_demands_project_idx
  ON public.arqdor_market_demands(tenant_id,project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS arqdor_market_demands_budget_idx
  ON public.arqdor_market_demands(tenant_id,budget_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.arqdor_market_demand_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id uuid NOT NULL REFERENCES public.arqdor_market_demands(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system',
  actor_id text NULL,
  source text NOT NULL DEFAULT 'vendorai',
  reference_type text NULL,
  reference_id text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arqdor_market_demand_events_timeline_idx
  ON public.arqdor_market_demand_events(demand_id,created_at,id);

ALTER TABLE public.arch_rfq_packages
  ADD COLUMN IF NOT EXISTS market_demand_id uuid NULL REFERENCES public.arqdor_market_demands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS arch_rfq_packages_market_demand_idx
  ON public.arch_rfq_packages(market_demand_id);

-- Resolver comissão por precedência: product > product_line > category > tenant > global.
CREATE OR REPLACE FUNCTION public.arqdor_market_resolve_commission(
  p_tenant_id text,
  p_category text DEFAULT NULL,
  p_product_line text DEFAULT NULL,
  p_product_id text DEFAULT NULL
)
RETURNS TABLE(rule_id uuid, percentage numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT r.id, r.percentage
  FROM public.arqdor_market_commission_rules r
  WHERE r.active=true
    AND (r.starts_at IS NULL OR r.starts_at <= now())
    AND (r.ends_at IS NULL OR r.ends_at >= now())
    AND (
      (r.scope_type='product' AND r.tenant_id=p_tenant_id AND r.scope_key=p_product_id)
      OR (r.scope_type='product_line' AND r.tenant_id=p_tenant_id AND r.scope_key=p_product_line)
      OR (r.scope_type='category' AND r.tenant_id=p_tenant_id AND lower(r.scope_key)=lower(p_category))
      OR (r.scope_type='tenant' AND r.tenant_id=p_tenant_id)
      OR (r.scope_type='global' AND r.tenant_id IS NULL)
    )
  ORDER BY
    CASE r.scope_type
      WHEN 'product' THEN 500
      WHEN 'product_line' THEN 400
      WHEN 'category' THEN 300
      WHEN 'tenant' THEN 200
      ELSE 100
    END DESC,
    r.priority DESC,
    r.created_at DESC
  LIMIT 1;
$$;

COMMENT ON TABLE public.arqdor_market_demands IS
  'Registro mestre/NSU da demanda do Market Arqdor. Deve permanecer rastreável até encerramento interno, externo ou cancelamento.';
COMMENT ON TABLE public.arqdor_market_demand_events IS
  'Ledger append-only dos eventos de uma demanda do Market Arqdor.';
