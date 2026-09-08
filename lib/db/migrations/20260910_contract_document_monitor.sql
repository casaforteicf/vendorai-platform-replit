-- Monitor de Contratos e Documentos do JARVIS
-- Campos opcionais e idempotentes para preservar contratos históricos.

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS renewal_type TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS renewal_notice_days INTEGER;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS next_adjustment_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS adjustment_index TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS obligations JSONB;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS risk_clauses JSONB;

CREATE INDEX IF NOT EXISTS contracts_tenant_expires_idx
  ON contracts (tenant_id, expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS contracts_tenant_adjustment_idx
  ON contracts (tenant_id, next_adjustment_at)
  WHERE next_adjustment_at IS NOT NULL;
