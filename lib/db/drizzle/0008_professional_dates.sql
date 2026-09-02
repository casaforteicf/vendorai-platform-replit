ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "profissao" text;--> statement-breakpoint
ALTER TABLE "tenant_calendar_settings" ADD COLUMN IF NOT EXISTS "professional_dates" jsonb DEFAULT '[]'::jsonb NOT NULL;
