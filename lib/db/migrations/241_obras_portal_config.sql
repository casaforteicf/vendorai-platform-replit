ALTER TABLE obras
ADD COLUMN IF NOT EXISTS portal_config jsonb NOT NULL DEFAULT '{"showOverview":true,"showSchedule":true,"showBudget":true,"showDiary":true,"showDiaryPhotos":true,"showFinancialSummary":false,"showClientDecisions":true}'::jsonb;
