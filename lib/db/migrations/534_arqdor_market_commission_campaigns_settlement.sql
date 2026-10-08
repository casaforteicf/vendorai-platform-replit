-- Market Arqdor — campanhas, exceções e liquidação de comissão no checkout.
ALTER TABLE public.arqdor_market_commission_rules
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS rule_kind text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS campaign_code text,
  ADD COLUMN IF NOT EXISTS adjustment_mode text NOT NULL DEFAULT 'override',
  ADD COLUMN IF NOT EXISTS conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_commission_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS min_commission_amount numeric(14,2);

DO $$ BEGIN
  ALTER TABLE public.arqdor_market_commission_rules
    ADD CONSTRAINT arqdor_market_commission_rules_kind_chk
    CHECK (rule_kind IN ('standard','campaign','promotion','exception','negotiated'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.arqdor_market_commission_rules
SET adjustment_mode='override'
WHERE adjustment_mode IS DISTINCT FROM 'override';

DO $$ BEGIN
  ALTER TABLE public.arqdor_market_commission_rules
    DROP CONSTRAINT IF EXISTS arqdor_market_commission_rules_adjustment_chk;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.arqdor_market_commission_rules
    ADD CONSTRAINT arqdor_market_commission_rules_adjustment_chk
    CHECK (adjustment_mode IN ('override'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.arqdor_market_commission_rules
    DROP CONSTRAINT IF EXISTS arqdor_market_commission_rules_scope_type_check;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.arqdor_market_commission_rules
    ADD CONSTRAINT arqdor_market_commission_rules_scope_type_chk
    CHECK (scope_type IN ('global','tenant','category','product_line','product','sku','brand'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.arqdor_market_commission_entries
  ADD COLUMN IF NOT EXISTS praca_order_id text REFERENCES public.praca_pedidos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_intent_id text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_payment_id text,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS rule_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.praca_pedidos
  ADD COLUMN IF NOT EXISTS market_demand_id uuid REFERENCES public.arqdor_market_demands(id) ON DELETE SET NULL;

ALTER TABLE public.praca_payment_intents
  ADD COLUMN IF NOT EXISTS market_demand_id uuid REFERENCES public.arqdor_market_demands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS market_commission_entry_id uuid REFERENCES public.arqdor_market_commission_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS praca_payment_intents_market_demand_idx
  ON public.praca_payment_intents(market_demand_id);

CREATE INDEX IF NOT EXISTS arqdor_market_commission_entries_payment_idx
  ON public.arqdor_market_commission_entries(payment_intent_id);

-- Resolve a taxa final considerando escopo, vigência, prioridade e condições.
-- conditions suportadas no momento: billingTypes[], minOrderValue, maxOrderValue,
-- buyerTenantIds[], sellerTenantIds[]. Outras chaves podem ser adicionadas sem migration.
CREATE OR REPLACE FUNCTION public.arqdor_market_resolve_commission_v2(
  p_tenant_id text,
  p_category text DEFAULT NULL,
  p_product_line text DEFAULT NULL,
  p_product_id text DEFAULT NULL,
  p_sku text DEFAULT NULL,
  p_brand text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  rule_id uuid,
  percentage numeric,
  rule_name text,
  rule_kind text,
  campaign_code text,
  adjustment_mode text,
  min_commission_amount numeric,
  max_commission_amount numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH eligible AS (
    SELECT r.*,
      CASE r.scope_type
        WHEN 'product' THEN 700
        WHEN 'sku' THEN 650
        WHEN 'brand' THEN 600
        WHEN 'product_line' THEN 500
        WHEN 'category' THEN 400
        WHEN 'tenant' THEN 300
        ELSE 100
      END AS specificity
    FROM public.arqdor_market_commission_rules r
    WHERE r.active=true
      AND (r.starts_at IS NULL OR r.starts_at <= now())
      AND (r.ends_at IS NULL OR r.ends_at >= now())
      AND (
        (r.scope_type='product' AND r.tenant_id=p_tenant_id AND r.scope_key=p_product_id)
        OR (r.scope_type='sku' AND r.tenant_id=p_tenant_id AND lower(r.scope_key)=lower(p_sku))
        OR (r.scope_type='brand' AND r.tenant_id=p_tenant_id AND lower(r.scope_key)=lower(p_brand))
        OR (r.scope_type='product_line' AND r.tenant_id=p_tenant_id AND lower(r.scope_key)=lower(p_product_line))
        OR (r.scope_type='category' AND r.tenant_id=p_tenant_id AND lower(r.scope_key)=lower(p_category))
        OR (r.scope_type='tenant' AND r.tenant_id=p_tenant_id)
        OR (r.scope_type='global' AND r.tenant_id IS NULL)
      )
      AND (
        NOT (r.conditions ? 'billingTypes')
        OR (p_context->>'billingType') = ANY (
          SELECT jsonb_array_elements_text(r.conditions->'billingTypes')
        )
      )
      AND (
        NOT (r.conditions ? 'minOrderValue')
        OR COALESCE((p_context->>'orderValue')::numeric,0) >= (r.conditions->>'minOrderValue')::numeric
      )
      AND (
        NOT (r.conditions ? 'maxOrderValue')
        OR COALESCE((p_context->>'orderValue')::numeric,0) <= (r.conditions->>'maxOrderValue')::numeric
      )
      AND (
        NOT (r.conditions ? 'buyerTenantIds')
        OR (p_context->>'buyerTenantId') = ANY (
          SELECT jsonb_array_elements_text(r.conditions->'buyerTenantIds')
        )
      )
      AND (
        NOT (r.conditions ? 'sellerTenantIds')
        OR (p_context->>'sellerTenantId') = ANY (
          SELECT jsonb_array_elements_text(r.conditions->'sellerTenantIds')
        )
      )
  ),
  chosen AS (
    SELECT *
    FROM eligible
    ORDER BY specificity DESC, priority DESC, created_at DESC
    LIMIT 1
  )
  SELECT
    id,
    GREATEST(0, LEAST(100, percentage)),
    COALESCE(name, scope_type || COALESCE(':' || scope_key,'')),
    rule_kind,
    campaign_code,
    adjustment_mode,
    min_commission_amount,
    max_commission_amount
  FROM chosen;
$$;

-- Mantém a função antiga apontando para a nova resolução básica.
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
  SELECT v.rule_id, v.percentage
  FROM public.arqdor_market_resolve_commission_v2(
    p_tenant_id,p_category,p_product_line,p_product_id,NULL,NULL,'{}'::jsonb
  ) v;
$$;

COMMENT ON COLUMN public.arqdor_market_commission_rules.conditions IS
  'Condições adicionais da regra/campanha, ex.: billingTypes, minOrderValue, maxOrderValue, buyerTenantIds, sellerTenantIds.';

ALTER TABLE public.arch_marketplace_pedidos
  ADD COLUMN IF NOT EXISTS market_demand_id uuid REFERENCES public.arqdor_market_demands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commission_rule_id uuid REFERENCES public.arqdor_market_commission_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commission_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS praca_order_id text REFERENCES public.praca_pedidos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS payment_intent_id text REFERENCES public.praca_payment_intents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS arch_marketplace_pedidos_market_demand_idx
  ON public.arch_marketplace_pedidos(market_demand_id);
CREATE INDEX IF NOT EXISTS arch_marketplace_pedidos_praca_order_idx
  ON public.arch_marketplace_pedidos(praca_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS arqdor_market_commission_entries_praca_order_uidx
  ON public.arqdor_market_commission_entries(praca_order_id)
  WHERE praca_order_id IS NOT NULL;
