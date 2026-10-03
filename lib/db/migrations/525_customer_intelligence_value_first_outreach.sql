-- Value-first SDR / Prospector: plano estruturado de abordagem por lead.
ALTER TABLE "customer_intelligence"
  ADD COLUMN IF NOT EXISTS "outreach_plan" jsonb;
