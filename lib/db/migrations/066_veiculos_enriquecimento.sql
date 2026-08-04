-- Enriquecimento do Estoque de Veículos (fotos de detalhe, vídeos) e
-- vínculo com o catálogo genérico do Praça.ai (sincronização automática).

ALTER TABLE veiculos_estoque ADD COLUMN IF NOT EXISTS fotos_detalhes jsonb;
ALTER TABLE veiculos_estoque ADD COLUMN IF NOT EXISTS videos jsonb;
ALTER TABLE veiculos_estoque ADD COLUMN IF NOT EXISTS produto_catalogo_id text;
CREATE INDEX IF NOT EXISTS idx_veiculos_estoque_produto_catalogo ON veiculos_estoque(produto_catalogo_id);
