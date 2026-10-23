-- ARQDOR — Procurement real flow
-- Solicitação → cotações → aprovação → pedido → recebimento → financeiro

ALTER TABLE public.compras_obras
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS etapa_id text,
  ADD COLUMN IF NOT EXISTS ambiente text,
  ADD COLUMN IF NOT EXISTS disciplina text,
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS unidade text NOT NULL DEFAULT 'un',
  ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS data_necessidade date,
  ADD COLUMN IF NOT EXISTS solicitante_id text,
  ADD COLUMN IF NOT EXISTS solicitante_nome text,
  ADD COLUMN IF NOT EXISTS aprovado_por_id text,
  ADD COLUMN IF NOT EXISTS aprovado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cotacao_selecionada_id uuid,
  ADD COLUMN IF NOT EXISTS pedido_fornecedor_id uuid,
  ADD COLUMN IF NOT EXISTS lancamento_financeiro_id text,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS documentos jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.arch_supplier_orders
  ADD COLUMN IF NOT EXISTS obra_id text,
  ADD COLUMN IF NOT EXISTS compra_id text,
  ADD COLUMN IF NOT EXISTS quote_number text,
  ADD COLUMN IF NOT EXISTS freight_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS quote_valid_until date,
  ADD COLUMN IF NOT EXISTS quoted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS ordered_at timestamptz,
  ADD COLUMN IF NOT EXISTS lead_time_days integer,
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_obras_etapa_id_fkey') THEN
    ALTER TABLE public.compras_obras ADD CONSTRAINT compras_obras_etapa_id_fkey FOREIGN KEY (etapa_id) REFERENCES public.obra_etapas(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_obras_cotacao_selecionada_id_fkey') THEN
    ALTER TABLE public.compras_obras ADD CONSTRAINT compras_obras_cotacao_selecionada_id_fkey FOREIGN KEY (cotacao_selecionada_id) REFERENCES public.arch_supplier_orders(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_obras_pedido_fornecedor_id_fkey') THEN
    ALTER TABLE public.compras_obras ADD CONSTRAINT compras_obras_pedido_fornecedor_id_fkey FOREIGN KEY (pedido_fornecedor_id) REFERENCES public.arch_supplier_orders(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_obras_lancamento_financeiro_id_fkey') THEN
    ALTER TABLE public.compras_obras ADD CONSTRAINT compras_obras_lancamento_financeiro_id_fkey FOREIGN KEY (lancamento_financeiro_id) REFERENCES public.obra_lancamentos(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arch_supplier_orders_obra_id_fkey') THEN
    ALTER TABLE public.arch_supplier_orders ADD CONSTRAINT arch_supplier_orders_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES public.obras(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arch_supplier_orders_compra_id_fkey') THEN
    ALTER TABLE public.arch_supplier_orders ADD CONSTRAINT arch_supplier_orders_compra_id_fkey FOREIGN KEY (compra_id) REFERENCES public.compras_obras(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.obra_compra_recebimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  compra_id text NOT NULL REFERENCES public.compras_obras(id) ON DELETE CASCADE,
  supplier_order_id uuid NOT NULL REFERENCES public.arch_supplier_orders(id) ON DELETE CASCADE,
  data_recebimento timestamptz NOT NULL DEFAULT now(),
  quantidade_recebida numeric NOT NULL DEFAULT 0,
  quantidade_aprovada numeric NOT NULL DEFAULT 0,
  quantidade_rejeitada numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'inspecao',
  responsavel_id text,
  responsavel_nome text,
  observacoes text,
  fotos jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.obra_compra_recebimentos ENABLE ROW LEVEL SECURITY;
-- PUBLIC is always available; revoke optional legacy Supabase roles only if present.
REVOKE ALL ON TABLE public.obra_compra_recebimentos FROM PUBLIC;
DO $
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.obra_compra_recebimentos FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.obra_compra_recebimentos FROM authenticated';
  END IF;
END $;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.obra_compra_recebimentos TO vendorai_app;

DROP POLICY IF EXISTS vendorai_tenant_access ON public.obra_compra_recebimentos;
CREATE POLICY vendorai_tenant_access ON public.obra_compra_recebimentos
FOR ALL TO vendorai_app
USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_compras_obras_obra_status ON public.compras_obras (obra_id, status);
CREATE INDEX IF NOT EXISTS idx_compras_obras_etapa ON public.compras_obras (etapa_id);
CREATE INDEX IF NOT EXISTS idx_arch_supplier_orders_compra ON public.arch_supplier_orders (compra_id);
CREATE INDEX IF NOT EXISTS idx_arch_supplier_orders_obra ON public.arch_supplier_orders (obra_id);
CREATE INDEX IF NOT EXISTS idx_obra_compra_recebimentos_compra ON public.obra_compra_recebimentos (compra_id);
CREATE INDEX IF NOT EXISTS idx_obra_compra_recebimentos_order ON public.obra_compra_recebimentos (supplier_order_id);
