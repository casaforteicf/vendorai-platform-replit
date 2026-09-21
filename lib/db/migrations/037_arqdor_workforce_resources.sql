-- ARQDOR workforce/resource planning fields for obra_etapas

ALTER TABLE public.obra_etapas
  ADD COLUMN IF NOT EXISTS equipe_nome text NULL,
  ADD COLUMN IF NOT EXISTS equipe_quantidade integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS horas_dia numeric(5,2) NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS custo_hora_pessoa numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS produtividade_dia numeric(12,3) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'obra_etapas_equipe_quantidade_check'
      AND conrelid = 'public.obra_etapas'::regclass
  ) THEN
    ALTER TABLE public.obra_etapas
      ADD CONSTRAINT obra_etapas_equipe_quantidade_check
      CHECK (equipe_quantidade >= 1 AND equipe_quantidade <= 500);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'obra_etapas_horas_dia_check'
      AND conrelid = 'public.obra_etapas'::regclass
  ) THEN
    ALTER TABLE public.obra_etapas
      ADD CONSTRAINT obra_etapas_horas_dia_check
      CHECK (horas_dia > 0 AND horas_dia <= 24);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'obra_etapas_custo_hora_pessoa_check'
      AND conrelid = 'public.obra_etapas'::regclass
  ) THEN
    ALTER TABLE public.obra_etapas
      ADD CONSTRAINT obra_etapas_custo_hora_pessoa_check
      CHECK (custo_hora_pessoa >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'obra_etapas_produtividade_dia_check'
      AND conrelid = 'public.obra_etapas'::regclass
  ) THEN
    ALTER TABLE public.obra_etapas
      ADD CONSTRAINT obra_etapas_produtividade_dia_check
      CHECK (produtividade_dia >= 0);
  END IF;
END $$;
