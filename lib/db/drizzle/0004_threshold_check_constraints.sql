ALTER TABLE "tenants" ADD CONSTRAINT "analysis_staleness_hours_positive" CHECK ("tenants"."analysis_staleness_hours" IS NULL OR "tenants"."analysis_staleness_hours" >= 1);--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "analysis_message_threshold_positive" CHECK ("tenants"."analysis_message_threshold" IS NULL OR "tenants"."analysis_message_threshold" >= 1);
