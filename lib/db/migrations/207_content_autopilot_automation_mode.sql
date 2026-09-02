ALTER TABLE content_autopilot_config
  ADD COLUMN IF NOT EXISTS automation_mode text NOT NULL DEFAULT 'suggestion';

UPDATE content_autopilot_config
SET automation_mode = CASE
  WHEN ativo = true THEN 'semi'
  ELSE 'suggestion'
END
WHERE automation_mode IS NULL OR automation_mode = 'suggestion';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'content_autopilot_automation_mode_check'
  ) THEN
    ALTER TABLE content_autopilot_config
      ADD CONSTRAINT content_autopilot_automation_mode_check
      CHECK (automation_mode IN ('suggestion', 'semi', 'automatic'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION sync_content_autopilot_automation_mode()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.automation_mode IS DISTINCT FROM 'suggestion' THEN
      NEW.ativo := NEW.automation_mode <> 'suggestion';
    ELSIF NEW.ativo = true THEN
      NEW.automation_mode := 'semi';
    ELSE
      NEW.automation_mode := 'suggestion';
      NEW.ativo := false;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.automation_mode IS DISTINCT FROM OLD.automation_mode THEN
    NEW.ativo := NEW.automation_mode <> 'suggestion';
  ELSIF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
    NEW.automation_mode := CASE WHEN NEW.ativo THEN 'semi' ELSE 'suggestion' END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_autopilot_automation_mode_sync ON content_autopilot_config;
CREATE TRIGGER content_autopilot_automation_mode_sync
BEFORE INSERT OR UPDATE OF automation_mode, ativo ON content_autopilot_config
FOR EACH ROW
EXECUTE FUNCTION sync_content_autopilot_automation_mode();
