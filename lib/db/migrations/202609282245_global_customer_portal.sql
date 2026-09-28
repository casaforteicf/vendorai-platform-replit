-- Global Client Portal — tenant-scoped customer identity entered from proposal links

CREATE TABLE IF NOT EXISTS public.customer_portal_users (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text NOT NULL,
  telefone text NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'ativo',
  ultimo_login_em timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_portal_users_unique_tenant_email UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS public.customer_portal_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.customer_portal_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_portal_access (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.customer_portal_users(id) ON DELETE CASCADE,
  lead_id text NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('budget_proposal','generated_proposal')),
  source_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_portal_access_unique_source UNIQUE (user_id, source_kind, source_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_portal_users_tenant ON public.customer_portal_users(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_customer_portal_sessions_user ON public.customer_portal_sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_customer_portal_access_tenant ON public.customer_portal_access(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_portal_access_lead ON public.customer_portal_access(lead_id);

ALTER TABLE public.customer_portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_portal_access ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer_portal_users','customer_portal_access']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS vendorai_tenant_access ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS vendorai_tenant_guard ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY vendorai_tenant_access ON public.%I AS PERMISSIVE FOR ALL TO vendorai_app USING (app_security.is_super_admin() OR tenant_id=app_security.current_tenant_id()) WITH CHECK (app_security.is_super_admin() OR tenant_id=app_security.current_tenant_id())',
      t
    );
    EXECUTE format(
      'CREATE POLICY vendorai_tenant_guard ON public.%I AS RESTRICTIVE FOR ALL TO vendorai_app USING (app_security.is_super_admin() OR tenant_id=app_security.current_tenant_id()) WITH CHECK (app_security.is_super_admin() OR tenant_id=app_security.current_tenant_id())',
      t
    );
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO vendorai_app', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public.customer_portal_sessions;
CREATE POLICY vendorai_parent_tenant_access ON public.customer_portal_sessions AS PERMISSIVE FOR ALL TO vendorai_app
USING (EXISTS (
  SELECT 1 FROM public.customer_portal_users u
  WHERE u.id = customer_portal_sessions.user_id
    AND (app_security.is_super_admin() OR u.tenant_id=app_security.current_tenant_id())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.customer_portal_users u
  WHERE u.id = customer_portal_sessions.user_id
    AND (app_security.is_super_admin() OR u.tenant_id=app_security.current_tenant_id())
));

DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public.customer_portal_sessions;
CREATE POLICY vendorai_parent_tenant_guard ON public.customer_portal_sessions AS RESTRICTIVE FOR ALL TO vendorai_app
USING (EXISTS (
  SELECT 1 FROM public.customer_portal_users u
  WHERE u.id = customer_portal_sessions.user_id
    AND (app_security.is_super_admin() OR u.tenant_id=app_security.current_tenant_id())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.customer_portal_users u
  WHERE u.id = customer_portal_sessions.user_id
    AND (app_security.is_super_admin() OR u.tenant_id=app_security.current_tenant_id())
));

GRANT SELECT,INSERT,UPDATE,DELETE ON public.customer_portal_sessions TO vendorai_app;
