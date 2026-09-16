-- ARQDOR advanced construction schedule
-- Adds physical/financial planning metadata and tenant-scoped task dependencies.

ALTER TABLE public.obra_etapas
  ADD COLUMN IF NOT EXISTS custo_previsto numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peso_fisico numeric(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marco boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'obra_etapas_peso_fisico_check'
      AND conrelid = 'public.obra_etapas'::regclass
  ) THEN
    ALTER TABLE public.obra_etapas
      ADD CONSTRAINT obra_etapas_peso_fisico_check
      CHECK (peso_fisico >= 0 AND peso_fisico <= 100);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.obra_etapa_dependencias (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  etapa_id text NOT NULL REFERENCES public.obra_etapas(id) ON DELETE CASCADE,
  depende_de_etapa_id text NOT NULL REFERENCES public.obra_etapas(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'FS',
  defasagem_dias integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT obra_etapa_dependencias_tipo_check CHECK (tipo IN ('FS','SS','FF','SF')),
  CONSTRAINT obra_etapa_dependencias_self_check CHECK (etapa_id <> depende_de_etapa_id),
  CONSTRAINT obra_etapa_dependencias_unique UNIQUE (etapa_id, depende_de_etapa_id)
);

CREATE INDEX IF NOT EXISTS obra_etapa_dependencias_obra_idx
  ON public.obra_etapa_dependencias (obra_id);
CREATE INDEX IF NOT EXISTS obra_etapa_dependencias_etapa_idx
  ON public.obra_etapa_dependencias (etapa_id);

ALTER TABLE public.obra_etapa_dependencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendorai_tenant_access ON public.obra_etapa_dependencias;
DROP POLICY IF EXISTS vendorai_tenant_guard ON public.obra_etapa_dependencias;

CREATE POLICY vendorai_tenant_access
  ON public.obra_etapa_dependencias
  AS PERMISSIVE
  FOR ALL
  TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

CREATE POLICY vendorai_tenant_guard
  ON public.obra_etapa_dependencias
  AS RESTRICTIVE
  FOR ALL
  TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.obra_etapa_dependencias TO vendorai_app;
