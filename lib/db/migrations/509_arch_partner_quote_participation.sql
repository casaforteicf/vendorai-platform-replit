-- Integra o diretório/solicitações do Arqdor à Rede de Parceiros sem criar novo módulo.

ALTER TABLE arch_partners
  ADD COLUMN IF NOT EXISTS connected_tenant_id text REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_source text NOT NULL DEFAULT 'external';

ALTER TABLE arch_solicitacoes
  ADD COLUMN IF NOT EXISTS recipient_tenant_id text REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS participation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS participation_percent numeric(7,4),
  ADD COLUMN IF NOT EXISTS platform_fee_percent numeric(7,4),
  ADD COLUMN IF NOT EXISTS agreement_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS attribution_window_days integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS attribution_source text NOT NULL DEFAULT 'architect_project',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS arch_partners_connected_tenant_idx
  ON arch_partners (connected_tenant_id);

CREATE INDEX IF NOT EXISTS arch_solicitacoes_recipient_tenant_idx
  ON arch_solicitacoes (recipient_tenant_id);

CREATE INDEX IF NOT EXISTS arch_solicitacoes_project_partner_idx
  ON arch_solicitacoes (projeto_id, partner_id);

ALTER TABLE arch_solicitacoes
  DROP CONSTRAINT IF EXISTS arch_solicitacoes_agreement_status_check;

ALTER TABLE arch_solicitacoes
  ADD CONSTRAINT arch_solicitacoes_agreement_status_check
  CHECK (agreement_status IN ('not_applicable','pending','accepted','rejected'));

ALTER TABLE arch_solicitacoes
  DROP CONSTRAINT IF EXISTS arch_solicitacoes_participation_percent_check;

ALTER TABLE arch_solicitacoes
  ADD CONSTRAINT arch_solicitacoes_participation_percent_check
  CHECK (participation_percent IS NULL OR (participation_percent >= 0 AND participation_percent <= 100));

ALTER TABLE arch_solicitacoes
  DROP CONSTRAINT IF EXISTS arch_solicitacoes_platform_fee_percent_check;

ALTER TABLE arch_solicitacoes
  ADD CONSTRAINT arch_solicitacoes_platform_fee_percent_check
  CHECK (platform_fee_percent IS NULL OR (platform_fee_percent >= 0 AND platform_fee_percent <= 100));
