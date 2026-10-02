-- Ensure lead special dates exist in every environment.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS special_dates jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.leads
SET special_dates = '[]'::jsonb
WHERE special_dates IS NULL;
