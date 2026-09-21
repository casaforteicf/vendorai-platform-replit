ALTER TABLE public.obras
ADD COLUMN IF NOT EXISTS portal_config jsonb NOT NULL DEFAULT '{
  "showOverview":true,
  "showSchedule":true,
  "showBudget":true,
  "showDiary":true,
  "showDiaryPhotos":true,
  "showFinancialSummary":false,
  "showFinancialDetails":false,
  "showClientDecisions":true,
  "showMeasurements":true,
  "showMilestones":true,
  "showDocuments":true,
  "showProcurementSummary":true,
  "showProjectGallery":true
}'::jsonb;

ALTER TABLE public.obras
ALTER COLUMN portal_config SET DEFAULT '{
  "showOverview":true,
  "showSchedule":true,
  "showBudget":true,
  "showDiary":true,
  "showDiaryPhotos":true,
  "showFinancialSummary":false,
  "showFinancialDetails":false,
  "showClientDecisions":true,
  "showMeasurements":true,
  "showMilestones":true,
  "showDocuments":true,
  "showProcurementSummary":true,
  "showProjectGallery":true
}'::jsonb;
