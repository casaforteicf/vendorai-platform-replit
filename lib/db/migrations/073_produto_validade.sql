-- Validade de lote genérica no catálogo — pedido #11 do documento de
-- Distribuidora de Alimentos, mas reutilizável pra qualquer vertical
-- com produto perecível. Alimenta a nova regra "produto_vencendo".

ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS data_validade timestamp;
CREATE INDEX IF NOT EXISTS idx_produtos_catalogo_validade ON produtos_catalogo(data_validade) WHERE data_validade IS NOT NULL;
