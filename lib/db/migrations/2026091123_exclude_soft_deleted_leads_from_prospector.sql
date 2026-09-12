-- /api/prospector/fila reads directly from leads and treats
-- pending/enriched/scored as active Prospector opportunities.
-- A soft-deleted lead must therefore never keep one of those states.

UPDATE leads
SET enrichment_status = 'discarded'
WHERE excluido_em IS NOT NULL
  AND enrichment_status IN ('pending', 'enriched', 'scored');

CREATE OR REPLACE FUNCTION keep_soft_deleted_lead_out_of_prospector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.excluido_em IS NOT NULL
     AND NEW.enrichment_status IN ('pending', 'enriched', 'scored') THEN
    NEW.enrichment_status := 'discarded';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keep_soft_deleted_lead_out_of_prospector ON leads;

CREATE TRIGGER trg_keep_soft_deleted_lead_out_of_prospector
BEFORE UPDATE OF excluido_em, enrichment_status ON leads
FOR EACH ROW
EXECUTE FUNCTION keep_soft_deleted_lead_out_of_prospector();
