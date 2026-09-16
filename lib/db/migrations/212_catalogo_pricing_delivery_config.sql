-- Configuração comercial e logística flexível por produto.
-- Mantém preco_base como preço oficial para compatibilidade com os fluxos atuais,
-- enquanto registra método de precificação, condições comerciais, regiões, taxas,
-- rotas, dias de entrega e exceções para uso pela IA, checkout e logística.

ALTER TABLE produtos_catalogo
  ADD COLUMN IF NOT EXISTS pricing_config jsonb,
  ADD COLUMN IF NOT EXISTS delivery_config jsonb;

COMMENT ON COLUMN produtos_catalogo.pricing_config IS
  'Configuração de precificação/comercialização por produto: método, preço de venda, mínimo, impostos, outros custos, à vista/parcelado e validade.';

COMMENT ON COLUMN produtos_catalogo.delivery_config IS
  'Configuração logística por produto: cobertura, regiões, taxas, prazos, rotas, dias de entrega e exceções.';
