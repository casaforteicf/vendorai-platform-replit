-- Medidas manuais na especificação técnica — ambiente (área, pé-direito) e
-- item (largura/altura/profundidade). Preenchimento manual, não estimado
-- por IA a partir da foto (não confiável pra medida real).
ALTER TABLE arch_specifications
  ADD COLUMN IF NOT EXISTS area_m2 numeric(8,2),
  ADD COLUMN IF NOT EXISTS pe_direito_m numeric(5,2);

ALTER TABLE arch_spec_items
  ADD COLUMN IF NOT EXISTS largura_cm numeric(8,1),
  ADD COLUMN IF NOT EXISTS altura_cm numeric(8,1),
  ADD COLUMN IF NOT EXISTS profundidade_cm numeric(8,1);
