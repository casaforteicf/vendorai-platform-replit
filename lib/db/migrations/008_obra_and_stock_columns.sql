-- obra_diario.resumo_ia + tenant stock confirmation columns
ALTER TABLE obra_diario ADD COLUMN IF NOT EXISTS resumo_ia TEXT;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS confirmar_estoque_antes_financeiro BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS usuario_conferencia_estoque_id TEXT;
