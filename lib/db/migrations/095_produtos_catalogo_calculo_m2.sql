-- Adiciona campos de cálculo por m² (ambiente/parede), fechamento de pacote e vínculo de coleção pra acabamento
ALTER TABLE produtos_catalogo
  ADD COLUMN IF NOT EXISTS tipo_calculo text,
  ADD COLUMN IF NOT EXISTS colecao text,
  ADD COLUMN IF NOT EXISTS fechamento_pacote numeric(12, 3),
  ADD COLUMN IF NOT EXISTS quantidade_pacote integer,
  ADD COLUMN IF NOT EXISTS preco_pacote numeric(12, 2),
  ADD COLUMN IF NOT EXISTS largura_peca_m numeric(8, 3);
