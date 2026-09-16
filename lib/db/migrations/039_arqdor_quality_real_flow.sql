-- ARQDOR — Qualidade real da obra
-- Amplia arch_quality_checks sem quebrar o fluxo de produção já existente.

ALTER TABLE public.arch_quality_checks
  ADD COLUMN IF NOT EXISTS obra_id text,
  ADD COLUMN IF NOT EXISTS etapa_id text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'checklist',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS corrective_action text,
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by_id text;

CREATE INDEX IF NOT EXISTS idx_arch_quality_checks_obra
  ON public.arch_quality_checks (obra_id);

CREATE INDEX IF NOT EXISTS idx_arch_quality_checks_etapa
  ON public.arch_quality_checks (etapa_id);

CREATE INDEX IF NOT EXISTS idx_arch_quality_checks_kind_status
  ON public.arch_quality_checks (kind, status);

CREATE INDEX IF NOT EXISTS idx_arch_quality_checks_due_date
  ON public.arch_quality_checks (due_date);
