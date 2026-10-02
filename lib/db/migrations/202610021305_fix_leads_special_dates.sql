ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS special_dates jsonb NOT NULL DEFAULT '[]'::jsonb;
