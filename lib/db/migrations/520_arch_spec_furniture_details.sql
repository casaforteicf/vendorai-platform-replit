ALTER TABLE arch_spec_items
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS modelo text,
  ADD COLUMN IF NOT EXISTS fabricante text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS configuracao text,
  ADD COLUMN IF NOT EXISTS material text,
  ADD COLUMN IF NOT EXISTS acabamento text,
  ADD COLUMN IF NOT EXISTS cor text,
  ADD COLUMN IF NOT EXISTS origem_medida text DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS unidade_quantificacao text DEFAULT 'un';

COMMENT ON COLUMN arch_spec_items.origem_medida IS
  'Fonte da medida: projeto | catalogo | confirmado | estimativa_ia | pendente';
