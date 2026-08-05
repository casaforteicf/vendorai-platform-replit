-- Conecta os dois sistemas paralelos de Farmácia: produtos ao catálogo
-- genérico (Praça.ai/Scout), e o pedido à receita médica estruturada
-- (validade/tipo/médico) em vez de só uma foto solta.

ALTER TABLE farmacia_produtos ADD COLUMN IF NOT EXISTS produto_catalogo_id text;
CREATE INDEX IF NOT EXISTS idx_farmacia_produtos_catalogo ON farmacia_produtos(produto_catalogo_id);

ALTER TABLE farmacia_pedidos ADD COLUMN IF NOT EXISTS receita_medica_id text;
CREATE INDEX IF NOT EXISTS idx_farmacia_pedidos_receita ON farmacia_pedidos(receita_medica_id);
