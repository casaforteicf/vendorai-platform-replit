-- Classificação de insumos por natureza para suportar mão de obra em diferentes bases.
ALTER TABLE insumos
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'material';

UPDATE insumos
SET tipo = 'mao_de_obra'
WHERE tipo = 'material'
  AND (
    lower(coalesce(categoria, '')) LIKE '%mão de obra%'
    OR lower(coalesce(categoria, '')) LIKE '%mao de obra%'
  );

CREATE INDEX IF NOT EXISTS insumos_tenant_tipo_idx
  ON insumos (tenant_id, tipo);
