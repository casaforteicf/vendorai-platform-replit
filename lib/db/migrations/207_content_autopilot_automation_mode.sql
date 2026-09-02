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
