-- categorias_produto table + produtos_catalogo desconto columns + deal_cobranca_tipo + agent_configs column
CREATE TABLE IF NOT EXISTS categorias_produto (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  desconto_maximo_percentual NUMERIC(5,2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS categoria_id TEXT REFERENCES categorias_produto(id) ON DELETE SET NULL;
ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS desconto_maximo_percentual NUMERIC(5,2);
ALTER TABLE produtos_catalogo DROP COLUMN IF EXISTS categoria;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deal_cobranca_tipo') THEN
    CREATE TYPE deal_cobranca_tipo AS ENUM ('automatico', 'manual');
  END IF;
END
$$;

ALTER TABLE deals ADD COLUMN IF NOT EXISTS cobranca_tipo deal_cobranca_tipo;

ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS pos_venda_inactivity_days INTEGER NOT NULL DEFAULT 30;
