-- Keep CRM state consistent when a lead is soft-deleted.
-- Existing soft-deleted leads must not keep active opportunities or Prospector queue rows.

DELETE FROM deals d
USING leads l
WHERE d.lead_id = l.id
  AND d.tenant_id = l.tenant_id
  AND l.excluido_em IS NOT NULL;

DELETE FROM prospector_queue pq
USING leads l
WHERE pq.lead_id = l.id
  AND pq.tenant_id = l.tenant_id
  AND l.excluido_em IS NOT NULL;

CREATE OR REPLACE FUNCTION cleanup_lead_relations_on_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.excluido_em IS NULL AND NEW.excluido_em IS NOT NULL THEN
    DELETE FROM deals
    WHERE tenant_id = NEW.tenant_id
      AND lead_id = NEW.id;

    DELETE FROM prospector_queue
    WHERE tenant_id = NEW.tenant_id
      AND lead_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_lead_relations_on_soft_delete ON leads;

CREATE TRIGGER trg_cleanup_lead_relations_on_soft_delete
AFTER UPDATE OF excluido_em ON leads
FOR EACH ROW
WHEN (OLD.excluido_em IS NULL AND NEW.excluido_em IS NOT NULL)
EXECUTE FUNCTION cleanup_lead_relations_on_soft_delete();
