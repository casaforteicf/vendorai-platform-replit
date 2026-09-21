-- Productivity defaults for construction compositions
ALTER TABLE public.composicoes
  ADD COLUMN IF NOT EXISTS produtividade_dia numeric(15,4) NULL,
  ADD COLUMN IF NOT EXISTS equipe_padrao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS horas_dia_padrao numeric(5,2) NOT NULL DEFAULT 8;

ALTER TABLE public.composicoes
  DROP CONSTRAINT IF EXISTS composicoes_equipe_padrao_check,
  ADD CONSTRAINT composicoes_equipe_padrao_check CHECK (equipe_padrao >= 1 AND equipe_padrao <= 500);

ALTER TABLE public.composicoes
  DROP CONSTRAINT IF EXISTS composicoes_produtividade_dia_check,
  ADD CONSTRAINT composicoes_produtividade_dia_check CHECK (produtividade_dia IS NULL OR produtividade_dia > 0);

ALTER TABLE public.composicoes
  DROP CONSTRAINT IF EXISTS composicoes_horas_dia_padrao_check,
  ADD CONSTRAINT composicoes_horas_dia_padrao_check CHECK (horas_dia_padrao > 0 AND horas_dia_padrao <= 24);
