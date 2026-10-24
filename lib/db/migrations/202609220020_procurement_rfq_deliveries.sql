-- Compras da obra — rastreio de solicitação de cotação enviada a fornecedores.
-- Fluxo: rascunho -> enviado -> visualizado -> respondido -> cotacao_recebida.
CREATE TABLE IF NOT EXISTS public.obra_compra_cotacao_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  compra_id text NOT NULL REFERENCES public.compras_obras(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES public.arch_supplier_orders(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
  destination text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','viewed','responded','quote_received','failed')),
  message text,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  quote_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.obra_compra_cotacao_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.obra_compra_cotacao_envios FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.obra_compra_cotacao_envios FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.obra_compra_cotacao_envios FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.obra_compra_cotacao_envios TO vendorai_app;

DROP POLICY IF EXISTS vendorai_tenant_access ON public.obra_compra_cotacao_envios;
CREATE POLICY vendorai_tenant_access ON public.obra_compra_cotacao_envios
FOR ALL TO vendorai_app
USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_obra_compra_cotacao_envios_compra
  ON public.obra_compra_cotacao_envios (compra_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obra_compra_cotacao_envios_obra
  ON public.obra_compra_cotacao_envios (obra_id, status);
CREATE INDEX IF NOT EXISTS idx_obra_compra_cotacao_envios_destination
  ON public.obra_compra_cotacao_envios (tenant_id, destination);
