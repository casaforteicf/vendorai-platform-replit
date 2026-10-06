-- Preserve CRM history when a lead is soft-deleted.
-- Previous trigger removed deals from the database. From now on deletion is
-- strictly logical: related deals stay stored and are hidden by active-list
-- queries while leads.excluido_em is set.

CREATE OR REPLACE FUNCTION cleanup_lead_relations_on_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Intentionally do not delete deals or other lead relations.
  -- Active views are responsible for filtering leads where excluido_em IS NOT NULL.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_lead_relations_on_soft_delete ON leads;

CREATE TRIGGER trg_cleanup_lead_relations_on_soft_delete
AFTER UPDATE OF excluido_em ON leads
FOR EACH ROW
WHEN (OLD.excluido_em IS NULL AND NEW.excluido_em IS NOT NULL)
EXECUTE FUNCTION cleanup_lead_relations_on_soft_delete();
