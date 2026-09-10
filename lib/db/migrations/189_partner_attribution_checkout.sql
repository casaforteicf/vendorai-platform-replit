-- Centraliza atribuição de parceiros/cupons do site/LP até o checkout do Praça.AI.
-- Valores continuam armazenados no backend para cálculo financeiro; a UI analítica deve priorizar percentuais.

ALTER TABLE praca_pedidos
  ADD COLUMN IF NOT EXISTS partner_id text REFERENCES partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cupom_codigo text,
  ADD COLUMN IF NOT EXISTS desconto_cupom_percentual numeric(5,2),
  ADD COLUMN IF NOT EXISTS origem_atribuicao text,
  ADD COLUMN IF NOT EXISTS attribution_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS praca_pedidos_partner_idx
  ON praca_pedidos (partner_id, created_at DESC)
  WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS praca_pedidos_cupom_idx
  ON praca_pedidos (cupom_codigo)
  WHERE cupom_codigo IS NOT NULL;

ALTER TABLE partner_commissions
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id text;

CREATE UNIQUE INDEX IF NOT EXISTS partner_commissions_source_unique_idx
  ON partner_commissions (partner_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
