ALTER TABLE "prospector_config" ADD COLUMN IF NOT EXISTS "cold_prospecting_mode" text DEFAULT 'off' NOT NULL;
ALTER TABLE "prospector_config" ADD COLUMN IF NOT EXISTS "allowed_solutions" jsonb DEFAULT '["vendorai"]'::jsonb NOT NULL;
ALTER TABLE "prospector_config" ADD COLUMN IF NOT EXISTS "target_segments" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "prospector_config" ADD COLUMN IF NOT EXISTS "target_personas" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "prospector_config" ADD COLUMN IF NOT EXISTS "allowed_channels" jsonb DEFAULT '["whatsapp"]'::jsonb NOT NULL;
ALTER TABLE "prospector_config" ADD COLUMN IF NOT EXISTS "contact_window_start" text DEFAULT '08:00' NOT NULL;
ALTER TABLE "prospector_config" ADD COLUMN IF NOT EXISTS "contact_window_end" text DEFAULT '18:00' NOT NULL;
ALTER TABLE "prospector_config" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL;
ALTER TABLE "prospector_config" ADD COLUMN IF NOT EXISTS "max_contacts_per_person_7d" integer DEFAULT 5 NOT NULL;
ALTER TABLE "prospector_config" ADD COLUMN IF NOT EXISTS "qualification_threshold" integer DEFAULT 70 NOT NULL;
ALTER TABLE "prospector_config" ADD COLUMN IF NOT EXISTS "meeting_readiness_threshold" integer DEFAULT 80 NOT NULL;
ALTER TABLE "prospector_config" ADD COLUMN IF NOT EXISTS "auto_send_approved_content" boolean DEFAULT false NOT NULL;
ALTER TABLE "prospector_config" ADD COLUMN IF NOT EXISTS "conversion_criteria" jsonb DEFAULT '{"requireResponsible":true,"requireConfirmedPain":true,"requireDecisionMakerOrPath":true,"requireMeetingAccepted":false}'::jsonb NOT NULL;

ALTER TABLE "prospector_config"
  DROP CONSTRAINT IF EXISTS "prospector_config_cold_prospecting_mode_check";
ALTER TABLE "prospector_config"
  ADD CONSTRAINT "prospector_config_cold_prospecting_mode_check"
  CHECK ("cold_prospecting_mode" IN ('off','assisted','autonomous'));

ALTER TABLE "prospector_config"
  DROP CONSTRAINT IF EXISTS "prospector_config_thresholds_check";
ALTER TABLE "prospector_config"
  ADD CONSTRAINT "prospector_config_thresholds_check"
  CHECK (
    "qualification_threshold" BETWEEN 0 AND 100
    AND "meeting_readiness_threshold" BETWEEN 0 AND 100
    AND "max_contacts_per_person_7d" BETWEEN 1 AND 30
  );
