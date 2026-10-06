-- Campos adicionais editáveis por ordem de serviço.
ALTER TABLE servicos_ordens
  ADD COLUMN IF NOT EXISTS campos_personalizados jsonb NOT NULL DEFAULT '[]'::jsonb;
