-- Aditiva; solicitar aprovação antes da aplicação em homologação/produção.
-- Cor de identificação do responsável no CRM, configurável pelo administrador do tenant.
CREATE TABLE IF NOT EXISTS public.tenant_user_colors (
  user_id text PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cor text NOT NULL,
  updated_by text,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT tenant_user_colors_cor_hex CHECK (cor ~ '^#[0-9a-fA-F]{6}$')
);
CREATE INDEX IF NOT EXISTS tenant_user_colors_tenant_idx ON public.tenant_user_colors (tenant_id);
ALTER TABLE public.tenant_user_colors ENABLE ROW LEVEL SECURITY;
-- Ambientes sem o role vendorai_app/app_security (ex.: homolog local) ficam só com RLS habilitado.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vendorai_app')
     AND to_regprocedure('app_security.current_tenant_id()') IS NOT NULL
     AND to_regprocedure('app_security.is_super_admin()') IS NOT NULL THEN
    DROP POLICY IF EXISTS vendorai_tenant_user_colors_access ON public.tenant_user_colors;
    CREATE POLICY vendorai_tenant_user_colors_access ON public.tenant_user_colors
      FOR ALL TO vendorai_app
      USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
      WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());
  END IF;
END $$;
