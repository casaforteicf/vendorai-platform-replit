-- Produto sucessor — alimenta "produto com nova versão" (#61) do
-- Revenue Scout comprador do Praça.ai.
ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS produto_sucessor_id text;
