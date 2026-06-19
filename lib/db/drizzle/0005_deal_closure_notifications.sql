ALTER TABLE "deals" ADD COLUMN "closure_triggered_at" timestamp;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "contract_status" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "contract_error" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "onboarding_status" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "onboarding_error" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "zapsign_doc_id" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "lost_at" timestamp;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "lost_reason" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "lost_reason_detail" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "asaas_charge_id" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "charge_link" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "charge_status" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "documento" text;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'warning' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;