ALTER TABLE arch_spec_items
  ADD COLUMN IF NOT EXISTS comprimento_cm numeric(9,1),
  ADD COLUMN IF NOT EXISTS espessura_cm numeric(7,1),
  ADD COLUMN IF NOT EXISTS area_bruta_m2 numeric(10,2),
  ADD COLUMN IF NOT EXISTS desconto_vaos_m2 numeric(10,2),
  ADD COLUMN IF NOT EXISTS area_liquida_m2 numeric(10,2),
  ADD COLUMN IF NOT EXISTS perimetro_m numeric(10,2),
  ADD COLUMN IF NOT EXISTS perda_percentual numeric(5,2),
  ADD COLUMN IF NOT EXISTS peitoril_cm numeric(7,1),
  ADD COLUMN IF NOT EXISTS modulos integer,
  ADD COLUMN IF NOT EXISTS portas integer,
  ADD COLUMN IF NOT EXISTS gavetas integer,
  ADD COLUMN IF NOT EXISTS prateleiras integer,
  ADD COLUMN IF NOT EXISTS posicao_referencia text;

COMMENT ON COLUMN arch_spec_items.origem_medida IS
  'Fonte da medida: projeto, catalogo, confirmado, estimativa_ia ou pendente. Estimativa IA nunca equivale a medida confirmada.';
