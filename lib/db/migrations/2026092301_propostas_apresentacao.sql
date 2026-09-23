-- Configuração de apresentação comercial do orçamento.
-- O cálculo interno continua usando itens/quantidades/valores completos;
-- esta coluna controla somente o que é exibido ao cliente.
ALTER TABLE propostas
  ADD COLUMN IF NOT EXISTS apresentacao JSONB NOT NULL
  DEFAULT '{"modoPadrao":"completo","etapas":{},"mostrarTotalGeral":true}'::jsonb;
