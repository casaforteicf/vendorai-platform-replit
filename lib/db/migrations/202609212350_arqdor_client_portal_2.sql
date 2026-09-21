-- Arqdor Client Portal 2.0 — private customer area

CREATE TABLE IF NOT EXISTS public.obra_portal_users (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text NOT NULL,
  telefone text NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'ativo',
  ultimo_login_em timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT obra_portal_users_unique_email UNIQUE (obra_id, email)
);

CREATE TABLE IF NOT EXISTS public.obra_portal_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.obra_portal_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.obra_portal_documents (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  categoria text NOT NULL DEFAULT 'documento',
  titulo text NOT NULL,
  descricao text NULL,
  url text NOT NULL,
  mime_type text NULL,
  versao text NULL,
  publicado_cliente boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.obra_portal_support_tickets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  portal_user_id text NULL REFERENCES public.obra_portal_users(id) ON DELETE SET NULL,
  assunto text NOT NULL,
  descricao text NOT NULL,
  prioridade text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'aberto',
  responsavel_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS public.obra_portal_messages (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  portal_user_id text NULL REFERENCES public.obra_portal_users(id) ON DELETE SET NULL,
  autor_tipo text NOT NULL CHECK (autor_tipo IN ('cliente','equipe')),
  autor_nome text NULL,
  mensagem text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obra_portal_users_obra ON public.obra_portal_users(obra_id);
CREATE INDEX IF NOT EXISTS idx_obra_portal_sessions_user ON public.obra_portal_sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_obra_portal_documents_obra ON public.obra_portal_documents(obra_id, categoria);
CREATE INDEX IF NOT EXISTS idx_obra_portal_support_obra ON public.obra_portal_support_tickets(obra_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obra_portal_messages_obra ON public.obra_portal_messages(obra_id, created_at DESC);

ALTER TABLE public.obra_portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_portal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_portal_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_portal_messages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['obra_portal_users','obra_portal_documents','obra_portal_support_tickets','obra_portal_messages']
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

GRANT SELECT,INSERT,UPDATE,DELETE ON public.obra_portal_sessions TO vendorai_app;
