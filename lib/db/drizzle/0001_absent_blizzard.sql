CREATE TABLE "intelligence_analysis_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"churn_risk" integer,
	"triggered_by" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "webhook_secret" text;--> statement-breakpoint
ALTER TABLE "intelligence_analysis_log" ADD CONSTRAINT "intelligence_analysis_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_analysis_log" ADD CONSTRAINT "intelligence_analysis_log_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;