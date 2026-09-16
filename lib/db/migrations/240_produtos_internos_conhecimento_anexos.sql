-- Biblioteca da Empresa: complementos estruturados e anexos da linha de
-- produtos internos Vendor.ai. Migração aditiva e retrocompatível.
ALTER TABLE produtos_internos
  ADD COLUMN IF NOT EXISTS detalhes jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE produtos_internos
  ADD COLUMN IF NOT EXISTS anexos jsonb NOT NULL DEFAULT '[]'::jsonb;
