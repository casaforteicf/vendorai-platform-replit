-- ARQDOR — Decisões auditáveis do projeto/obra

CREATE TABLE IF NOT EXISTS public.arch_project_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  obra_id text NULL,
  etapa_id text NULL,
  budget_id uuid NULL,
  proposal_id uuid NULL,
  title text NOT NULL,
  description text NULL,
  category text NULL,
  decision_type text NOT NULL DEFAULT 'client',
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'medium',
  requested_by_name text NULL,
  requested_by_id text NULL,
  responsible text NULL,
  due_date date NULL,
  decided_at timestamptz NULL,
  decided_by_name text NULL,
  decided_by_id text NULL,
  decision_comment text NULL,
  financial_impact numeric(15,2) NOT NULL DEFAULT 0,
  schedule_impact_days integer NOT NULL DEFAULT 0,
  requires_budget_revision boolean NOT NULL DEFAULT false,
  budget_revision_status text NOT NULL DEFAULT 'not-required',
  source text NOT NULL DEFAULT 'manual',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_option jsonb NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.arch_project_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendorai_tenant_access ON public.arch_project_decisions;
CREATE POLICY vendorai_tenant_access ON public.arch_project_decisions
  FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id::text = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id::text = app_security.current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_arch_project_decisions_tenant ON public.arch_project_decisions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_project_decisions_project ON public.arch_project_decisions (project_id);
CREATE INDEX IF NOT EXISTS idx_arch_project_decisions_obra ON public.arch_project_decisions (obra_id);
CREATE INDEX IF NOT EXISTS idx_arch_project_decisions_status ON public.arch_project_decisions (status);
CREATE INDEX IF NOT EXISTS idx_arch_project_decisions_due ON public.arch_project_decisions (due_date);
