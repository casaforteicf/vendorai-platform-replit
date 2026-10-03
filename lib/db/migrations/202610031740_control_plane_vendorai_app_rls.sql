-- Control-plane interno: permite ao backend VendorAI operar as tabelas administrativas
-- mantendo RLS ativo e sem abrir acesso para anon/authenticated.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vendorai_app') THEN
    EXECUTE 'DROP POLICY IF EXISTS vendorai_control_plane_internal ON public.admin_improvements';
    EXECUTE 'CREATE POLICY vendorai_control_plane_internal ON public.admin_improvements FOR ALL TO vendorai_app USING (true) WITH CHECK (true)';

    EXECUTE 'DROP POLICY IF EXISTS vendorai_control_plane_internal ON public.admin_releases';
    EXECUTE 'CREATE POLICY vendorai_control_plane_internal ON public.admin_releases FOR ALL TO vendorai_app USING (true) WITH CHECK (true)';

    EXECUTE 'DROP POLICY IF EXISTS vendorai_control_plane_internal ON public.admin_improvement_events';
    EXECUTE 'CREATE POLICY vendorai_control_plane_internal ON public.admin_improvement_events FOR ALL TO vendorai_app USING (true) WITH CHECK (true)';

    EXECUTE 'DROP POLICY IF EXISTS vendorai_control_plane_internal ON public.admin_improvement_pr_registry';
    EXECUTE 'CREATE POLICY vendorai_control_plane_internal ON public.admin_improvement_pr_registry FOR ALL TO vendorai_app USING (true) WITH CHECK (true)';
  END IF;
END $$;
