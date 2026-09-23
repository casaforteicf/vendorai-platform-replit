-- Uma revisão antiga do mesmo cliente não pode inflar o valor atual da pipeline.
-- Mantemos todas as revisões no histórico, mas somente um negócio comercial aberto
-- por tenant+lead pode estar marcado como ativo para os indicadores atuais.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS pipeline_active boolean NOT NULL DEFAULT true;

-- Backfill determinístico: entre os negócios comerciais abertos existentes de cada
-- cliente, a revisão atualizada mais recentemente passa a ser a ativa.
UPDATE public.deals
SET pipeline_active = false;

WITH ranked_open_deals AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, lead_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.deals
  WHERE lead_id IS NOT NULL
    AND etapa NOT IN ('em_aquecimento', 'parceiro', 'em_execucao', 'ganho', 'entregue', 'perdido')
)
UPDATE public.deals d
SET pipeline_active = true
FROM ranked_open_deals r
WHERE d.id = r.id
  AND r.rn = 1;

-- Qualquer caminho de criação/edição (humano, agente ou integração) que marque
-- um negócio como ativo desmarca automaticamente as revisões abertas irmãs.
CREATE OR REPLACE FUNCTION public.enforce_single_pipeline_active_deal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pipeline_active IS TRUE
     AND NEW.lead_id IS NOT NULL
     AND NEW.etapa NOT IN ('em_aquecimento', 'parceiro', 'em_execucao', 'ganho', 'entregue', 'perdido') THEN
    UPDATE public.deals
       SET pipeline_active = false
     WHERE tenant_id = NEW.tenant_id
       AND lead_id = NEW.lead_id
       AND id IS DISTINCT FROM NEW.id
       AND pipeline_active IS TRUE
       AND etapa NOT IN ('em_aquecimento', 'parceiro', 'em_execucao', 'ganho', 'entregue', 'perdido');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_pipeline_active_deal ON public.deals;

CREATE TRIGGER trg_single_pipeline_active_deal
BEFORE INSERT OR UPDATE OF pipeline_active, lead_id, etapa
ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.enforce_single_pipeline_active_deal();

-- Defesa adicional contra corrida entre duas seleções simultâneas.
CREATE UNIQUE INDEX IF NOT EXISTS deals_one_pipeline_active_per_lead_idx
  ON public.deals (tenant_id, lead_id)
  WHERE pipeline_active IS TRUE
    AND lead_id IS NOT NULL
    AND etapa NOT IN ('em_aquecimento', 'parceiro', 'em_execucao', 'ganho', 'entregue', 'perdido');
