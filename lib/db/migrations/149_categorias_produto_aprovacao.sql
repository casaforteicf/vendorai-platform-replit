-- Fluxo de aprovação pra categorias criadas automaticamente na importação
-- (pedido real: hoje a importação cria categoria nova sem avisar ninguém
-- quando o nome não bate exato com nenhuma existente).
ALTER TABLE categorias_produto
  ADD COLUMN IF NOT EXISTS precisa_aprovacao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aprovado_por text REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS aprovado_em timestamp;

CREATE INDEX IF NOT EXISTS idx_categorias_produto_pendentes
  ON categorias_produto (tenant_id)
  WHERE precisa_aprovacao = true;
