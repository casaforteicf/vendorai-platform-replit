-- Padrões de pré-agenda por tipo de atividade (ex.: assistência toda segunda-feira).
ALTER TABLE public.tenant_calendar_settings
  ADD COLUMN IF NOT EXISTS activity_schedule_defaults jsonb NOT NULL DEFAULT '[]'::jsonb;