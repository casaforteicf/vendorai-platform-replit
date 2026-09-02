CREATE TABLE IF NOT EXISTS "orcamento_revisoes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"deal_id" text,
	"numero_orcamento" text NOT NULL,
	"data_orcamento" date NOT NULL,
	"apresentacao" text,
	"observacao" text,
	"anexos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orcamento_revisoes" ADD CONSTRAINT "orcamento_revisoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orcamento_revisoes" ADD CONSTRAINT "orcamento_revisoes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orcamento_revisoes" ADD CONSTRAINT "orcamento_revisoes_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orcamento_revisoes" ADD CONSTRAINT "orcamento_revisoes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orcamento_revisoes_lead_id_idx" ON "orcamento_revisoes" ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orcamento_revisoes_tenant_id_idx" ON "orcamento_revisoes" ("tenant_id");
