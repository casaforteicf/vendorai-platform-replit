ALTER TABLE arch_projetos
ADD COLUMN IF NOT EXISTS dossie_projeto jsonb NOT NULL DEFAULT '{}'::jsonb;
