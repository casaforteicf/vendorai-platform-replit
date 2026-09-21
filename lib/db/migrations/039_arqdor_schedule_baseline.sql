-- ARQDOR schedule baseline snapshots

CREATE TABLE IF NOT EXISTS public.obra_baselines (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'Linha de base',
  observacao text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.obra_baseline_etapas (
  id text PRIMARY KEY,
  baseline_id text NOT NULL REFERENCES public.obra_baselines(id) ON DELETE CASCADE,
  -- Keep the original stage id as immutable snapshot metadata.
  -- Do not FK/cascade to obra_etapas: deleting/restructuring a live stage must not erase baseline history.
  etapa_id text NOT NULL,
  nome text NOT NULL,
  data_inicio_prevista date NULL,
  data_fim_prevista date NULL,
  custo_previsto numeric(15,2) NOT NULL DEFAULT 0,
  peso_fisico numeric(7,4) NOT NULL DEFAULT 0,
  equipe_nome text NULL,
  equipe_quantidade integer NOT NULL DEFAULT 1,
  horas_dia numeric(5,2) NOT NULL DEFAULT 8,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT obra_baseline_etapas_unique UNIQUE (baseline_id, etapa_id)
);

CREATE INDEX IF NOT EXISTS obra_baselines_obra_idx ON public.obra_baselines (obra_id, created_at DESC);
CREATE INDEX IF NOT EXISTS obra_baselines_tenant_idx ON public.obra_baselines (tenant_id);
CREATE INDEX IF NOT EXISTS obra_baseline_etapas_baseline_idx ON public.obra_baseline_etapas (baseline_id);

ALTER TABLE public.obra_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_baseline_etapas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendorai_tenant_access ON public.obra_baselines;
DROP POLICY IF EXISTS vendorai_tenant_guard ON public.obra_baselines;
CREATE POLICY vendorai_tenant_access
  ON public.obra_baselines
  AS PERMISSIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());
CREATE POLICY vendorai_tenant_guard
  ON public.obra_baselines
  AS RESTRICTIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

DROP POLICY IF EXISTS vendorai_tenant_access ON public.obra_baseline_etapas;
DROP POLICY IF EXISTS vendorai_tenant_guard ON public.obra_baseline_etapas;
CREATE POLICY vendorai_tenant_access
  ON public.obra_baseline_etapas
  AS PERMISSIVE FOR ALL TO vendorai_app
  USING (
    app_security.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.obra_baselines b
      WHERE b.id = baseline_id AND b.tenant_id = app_security.current_tenant_id()
    )
  )
  WITH CHECK (
    app_security.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.obra_baselines b
      WHERE b.id = baseline_id AND b.tenant_id = app_security.current_tenant_id()
    )
  );
CREATE POLICY vendorai_tenant_guard
  ON public.obra_baseline_etapas
  AS RESTRICTIVE FOR ALL TO vendorai_app
  USING (
    app_security.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.obra_baselines b
      WHERE b.id = baseline_id AND b.tenant_id = app_security.current_tenant_id()
    )
  )
  WITH CHECK (
    app_security.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.obra_baselines b
      WHERE b.id = baseline_id AND b.tenant_id = app_security.current_tenant_id()
    )
  );

GRANT SELECT, INSERT, DELETE ON public.obra_baselines TO vendorai_app;
GRANT SELECT, INSERT, DELETE ON public.obra_baseline_etapas TO vendorai_app;
