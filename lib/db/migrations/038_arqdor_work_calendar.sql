-- ARQDOR work calendars per construction project

CREATE TABLE IF NOT EXISTS public.obra_calendarios (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  segunda boolean NOT NULL DEFAULT true,
  terca boolean NOT NULL DEFAULT true,
  quarta boolean NOT NULL DEFAULT true,
  quinta boolean NOT NULL DEFAULT true,
  sexta boolean NOT NULL DEFAULT true,
  sabado boolean NOT NULL DEFAULT false,
  domingo boolean NOT NULL DEFAULT false,
  horas_dia numeric(5,2) NOT NULL DEFAULT 8,
  feriados jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT obra_calendarios_obra_unique UNIQUE (obra_id),
  CONSTRAINT obra_calendarios_horas_dia_check CHECK (horas_dia > 0 AND horas_dia <= 24)
);

CREATE INDEX IF NOT EXISTS obra_calendarios_tenant_idx ON public.obra_calendarios (tenant_id);
CREATE INDEX IF NOT EXISTS obra_calendarios_obra_idx ON public.obra_calendarios (obra_id);

ALTER TABLE public.obra_calendarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendorai_tenant_access ON public.obra_calendarios;
DROP POLICY IF EXISTS vendorai_tenant_guard ON public.obra_calendarios;

CREATE POLICY vendorai_tenant_access
  ON public.obra_calendarios
  AS PERMISSIVE
  FOR ALL
  TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

CREATE POLICY vendorai_tenant_guard
  ON public.obra_calendarios
  AS RESTRICTIVE
  FOR ALL
  TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.obra_calendarios TO vendorai_app;
