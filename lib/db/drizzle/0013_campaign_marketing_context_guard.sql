-- Protege o Briefing Mestre de campanhas contra perda silenciosa em PATCHs parciais.
--
-- Cenário protegido:
-- um cliente antigo ou outro módulo atualiza segmento_filtro sem reenviar
-- marketingContext (ou envia apenas parte dele). O banco preserva os campos
-- já existentes e aplica somente os campos recebidos.
--
-- Para Revenue Scout, leadIds também é preservado quando o campo é omitido.
-- Para limpar leadIds de forma intencional, envie leadIds: [].
-- Um marketingContext explicitamente null continua sendo respeitado como remoção
-- em operações SQL diretas; a API atual normalmente não envia null para esse campo.

CREATE OR REPLACE FUNCTION public.preserve_campaign_briefing_on_segment_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_filter jsonb;
  new_filter jsonb;
  old_marketing jsonb;
  new_marketing jsonb;
BEGIN
  -- Respeita remoção explícita do filtro inteiro e evita assumir formato inválido.
  IF NEW.segmento_filtro IS NULL OR jsonb_typeof(NEW.segmento_filtro) <> 'object' THEN
    RETURN NEW;
  END IF;

  old_filter := CASE
    WHEN OLD.segmento_filtro IS NOT NULL AND jsonb_typeof(OLD.segmento_filtro) = 'object'
      THEN OLD.segmento_filtro
    ELSE '{}'::jsonb
  END;
  new_filter := NEW.segmento_filtro;

  old_marketing := old_filter -> 'marketingContext';
  new_marketing := new_filter -> 'marketingContext';

  -- Se o cliente não reenviou marketingContext, preserva o briefing completo.
  -- Se reenviou apenas uma parte, faz merge raso por campo: o novo prevalece.
  IF jsonb_typeof(old_marketing) = 'object' THEN
    IF NOT (new_filter ? 'marketingContext') THEN
      new_filter := jsonb_set(
        new_filter,
        '{marketingContext}',
        old_marketing,
        true
      );
    ELSIF jsonb_typeof(new_marketing) = 'object' THEN
      new_filter := jsonb_set(
        new_filter,
        '{marketingContext}',
        old_marketing || new_marketing,
        true
      );
    END IF;
  END IF;

  -- leadIds identifica a audiência fixa originada no Revenue Scout.
  -- Omitir o campo em um PATCH não deve trocar silenciosamente a audiência.
  IF (old_filter ? 'leadIds') AND NOT (new_filter ? 'leadIds') THEN
    new_filter := jsonb_set(
      new_filter,
      '{leadIds}',
      old_filter -> 'leadIds',
      true
    );
  END IF;

  NEW.segmento_filtro := new_filter;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaigns_preserve_briefing_on_segment_update ON public.campaigns;

CREATE TRIGGER campaigns_preserve_briefing_on_segment_update
BEFORE UPDATE OF segmento_filtro ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.preserve_campaign_briefing_on_segment_update();
