-- Bootstrap missing table for fresh PostgreSQL installations. Matches the current Drizzle schema.
CREATE TABLE IF NOT EXISTS public.seller_commissions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  seller_user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  cliente_tenant_id text REFERENCES public.tenants(id) ON DELETE SET NULL,
  deal_id text REFERENCES public.deals(id) ON DELETE SET NULL,
  plan_slug text,
  cliente_nome text,
  valor_implantacao_cents integer NOT NULL,
  percentual numeric(7,4) NOT NULL DEFAULT 0,
  valor_comissao_cents integer NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pendente',
  observacoes text,
  paid_at timestamp,
  paid_by_user_id text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seller_commissions_tenant_idx ON public.seller_commissions (tenant_id);
CREATE INDEX IF NOT EXISTS seller_commissions_seller_idx ON public.seller_commissions (seller_user_id);
CREATE INDEX IF NOT EXISTS seller_commissions_deal_idx ON public.seller_commissions (deal_id);

-- Match the tenant-scoped application access pattern; no PUBLIC grants.
ALTER TABLE public.seller_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendorai_tenant_access ON public.seller_commissions;
CREATE POLICY vendorai_tenant_access ON public.seller_commissions
  FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_commissions TO vendorai_app;

ALTER TABLE seller_commissions
  ALTER COLUMN percentual TYPE numeric(7,4) USING percentual::numeric,
  ALTER COLUMN percentual SET DEFAULT 0;

ALTER TABLE seller_commissions
  ADD COLUMN IF NOT EXISTS detalhes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN seller_commissions.percentual IS
  'Percentual efetivo ponderado. A regra de cada item fica em detalhes.';

COMMENT ON COLUMN seller_commissions.detalhes IS
  'Comissão por item vendido, calculada sobre o preço efetivo da proposta.';
