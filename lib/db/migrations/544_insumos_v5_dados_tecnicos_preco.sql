ALTER TABLE insumos
  ADD COLUMN IF NOT EXISTS origem_preco text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS preco_validade date,
  ADD COLUMN IF NOT EXISTS preco_atualizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS regiao_preco text,
  ADD COLUMN IF NOT EXISTS fornecedor_preferencial text,
  ADD COLUMN IF NOT EXISTS marca text,
  ADD COLUMN IF NOT EXISTS modelo text,
  ADD COLUMN IF NOT EXISTS fabricante text,
  ADD COLUMN IF NOT EXISTS especificacao_tecnica jsonb;

UPDATE insumos
SET preco_atualizado_em = COALESCE(preco_atualizado_em, updated_at)
WHERE preco_unitario IS NOT NULL
  AND preco_atualizado_em IS NULL;

CREATE INDEX IF NOT EXISTS insumos_tenant_codigo_idx
  ON insumos(tenant_id, codigo);

CREATE INDEX IF NOT EXISTS insumos_tenant_categoria_idx
  ON insumos(tenant_id, categoria);

CREATE INDEX IF NOT EXISTS insumos_tenant_fornecedor_idx
  ON insumos(tenant_id, fornecedor_preferencial);
