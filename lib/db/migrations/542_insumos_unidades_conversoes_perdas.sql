ALTER TABLE insumos
  ADD COLUMN IF NOT EXISTS unidade_compra text,
  ADD COLUMN IF NOT EXISTS fator_compra_para_consumo numeric(15,6),
  ADD COLUMN IF NOT EXISTS embalagem_quantidade numeric(15,4),
  ADD COLUMN IF NOT EXISTS quantidade_minima_compra numeric(15,4),
  ADD COLUMN IF NOT EXISTS multiplo_compra numeric(15,4),
  ADD COLUMN IF NOT EXISTS permite_fracionar_compra boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perda_padrao_percentual numeric(7,3) NOT NULL DEFAULT 0;

ALTER TABLE composicao_insumos
  ADD COLUMN IF NOT EXISTS perda_percentual_override numeric(7,3);

UPDATE insumos
SET
  unidade_compra = COALESCE(unidade_compra, unidade),
  fator_compra_para_consumo = COALESCE(fator_compra_para_consumo, 1),
  multiplo_compra = COALESCE(multiplo_compra, 1)
WHERE unidade_compra IS NULL
   OR fator_compra_para_consumo IS NULL
   OR multiplo_compra IS NULL;
