ALTER TABLE public.compras_obras
  ADD COLUMN IF NOT EXISTS prazo_fornecedor_dias integer NOT NULL DEFAULT 0;

ALTER TABLE public.compras_obras
  DROP CONSTRAINT IF EXISTS compras_obras_prazo_fornecedor_dias_check,
  ADD CONSTRAINT compras_obras_prazo_fornecedor_dias_check
    CHECK (prazo_fornecedor_dias >= 0 AND prazo_fornecedor_dias <= 3650);

CREATE INDEX IF NOT EXISTS idx_compras_obras_etapa_necessidade
  ON public.compras_obras (etapa_id, data_necessidade);
