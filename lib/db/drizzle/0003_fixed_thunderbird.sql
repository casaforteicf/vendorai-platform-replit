ALTER TABLE "customer_intelligence" ADD COLUMN "churn_reasons_edited_by" text;--> statement-breakpoint
ALTER TABLE "customer_intelligence" ADD COLUMN "churn_reasons_edited_at" timestamp;--> statement-breakpoint
ALTER TABLE "customer_intelligence" ADD CONSTRAINT "churn_risk_range" CHECK ("customer_intelligence"."churn_risk" >= 0 AND "customer_intelligence"."churn_risk" <= 100);
