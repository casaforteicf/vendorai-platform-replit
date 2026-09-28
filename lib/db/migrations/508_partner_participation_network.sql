-- Evolui o commission_engine existente para o modelo de Participação da Rede de Parceiros.
-- Mantém nomes legados de colunas/tabelas para compatibilidade com integrações atuais.

ALTER TABLE commission_rules
  ADD COLUMN IF NOT EXISTS participation_type text NOT NULL DEFAULT 'sales',
  ADD COLUMN IF NOT EXISTS platform_fee_percent numeric(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attribution_window_days integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS requires_mutual_acceptance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_months integer;

ALTER TABLE commission_events
  ADD COLUMN IF NOT EXISTS participation_type text NOT NULL DEFAULT 'sales',
  ADD COLUMN IF NOT EXISTS project_id text,
  ADD COLUMN IF NOT EXISTS platform_fee_percent numeric(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_cents integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS commission_rules_participation_idx
  ON commission_rules (tenant_id, participation_type, active);

CREATE INDEX IF NOT EXISTS commission_events_participation_idx
  ON commission_events (tenant_id, participation_type, status);

CREATE INDEX IF NOT EXISTS commission_events_project_idx
  ON commission_events (project_id);

ALTER TABLE commission_rules
  DROP CONSTRAINT IF EXISTS commission_rules_participation_type_check;

ALTER TABLE commission_rules
  ADD CONSTRAINT commission_rules_participation_type_check
  CHECK (participation_type IN ('sales','specification','acquisition'));

ALTER TABLE commission_events
  DROP CONSTRAINT IF EXISTS commission_events_participation_type_check;

ALTER TABLE commission_events
  ADD CONSTRAINT commission_events_participation_type_check
  CHECK (participation_type IN ('sales','specification','acquisition'));

ALTER TABLE commission_rules
  DROP CONSTRAINT IF EXISTS commission_rules_platform_fee_percent_check;

ALTER TABLE commission_rules
  ADD CONSTRAINT commission_rules_platform_fee_percent_check
  CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 100);

ALTER TABLE commission_rules
  DROP CONSTRAINT IF EXISTS commission_rules_attribution_window_days_check;

ALTER TABLE commission_rules
  ADD CONSTRAINT commission_rules_attribution_window_days_check
  CHECK (attribution_window_days >= 0);

ALTER TABLE commission_rules
  DROP CONSTRAINT IF EXISTS commission_rules_recurring_months_check;

ALTER TABLE commission_rules
  ADD CONSTRAINT commission_rules_recurring_months_check
  CHECK (recurring_months IS NULL OR recurring_months > 0);
