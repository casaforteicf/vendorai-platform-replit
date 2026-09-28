-- Completa o fluxo de cotação do ecossistema Arqdor na própria arch_solicitacoes.
ALTER TABLE arch_solicitacoes
  ADD COLUMN IF NOT EXISTS quote_scope text,
  ADD COLUMN IF NOT EXISTS quote_amount_cents integer,
  ADD COLUMN IF NOT EXISTS quote_delivery_days integer,
  ADD COLUMN IF NOT EXISTS quote_valid_until timestamptz,
  ADD COLUMN IF NOT EXISTS quote_response_message text,
  ADD COLUMN IF NOT EXISTS quote_proposal_url text,
  ADD COLUMN IF NOT EXISTS selected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS selected_at timestamptz,
  ADD COLUMN IF NOT EXISTS selected_by_tenant_id text REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sale_amount_cents integer,
  ADD COLUMN IF NOT EXISTS participation_event_id text;

CREATE INDEX IF NOT EXISTS arch_solicitacoes_quote_compare_idx
  ON arch_solicitacoes (tenant_id, projeto_id, quote_scope, status);

CREATE INDEX IF NOT EXISTS arch_solicitacoes_inbox_idx
  ON arch_solicitacoes (recipient_tenant_id, status, created_at DESC);

ALTER TABLE arch_solicitacoes DROP CONSTRAINT IF EXISTS arch_solicitacoes_quote_amount_check;
ALTER TABLE arch_solicitacoes ADD CONSTRAINT arch_solicitacoes_quote_amount_check
  CHECK (quote_amount_cents IS NULL OR quote_amount_cents >= 0);

ALTER TABLE arch_solicitacoes DROP CONSTRAINT IF EXISTS arch_solicitacoes_sale_amount_check;
ALTER TABLE arch_solicitacoes ADD CONSTRAINT arch_solicitacoes_sale_amount_check
  CHECK (sale_amount_cents IS NULL OR sale_amount_cents >= 0);
