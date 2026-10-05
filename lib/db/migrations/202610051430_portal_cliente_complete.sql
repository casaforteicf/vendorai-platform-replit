-- Portal do Cliente 2.0 completo — conteúdo publicável, permissões e auditoria

CREATE TABLE IF NOT EXISTS public.obra_portal_items (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  description text NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility text NOT NULL DEFAULT 'interno'
    CHECK (visibility IN ('interno','compartilhavel','publicado','arquivado')),
  version text NULL,
  due_at timestamptz NULL,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  requires_action boolean NOT NULL DEFAULT false,
  action_type text NULL,
  allow_download boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  published_at timestamptz NULL,
  created_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.obra_portal_item_responses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES public.obra_portal_items(id) ON DELETE CASCADE,
  portal_user_id text NULL REFERENCES public.obra_portal_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  comment text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.obra_portal_audit (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  portal_user_id text NULL REFERENCES public.obra_portal_users(id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'system',
  actor_name text NULL,
  event_type text NOT NULL,
  entity_type text NULL,
  entity_id text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.obra_portal_users
  ADD COLUMN IF NOT EXISTS access_role text NOT NULL DEFAULT 'proprietario',
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS access_expires_at timestamptz NULL;

ALTER TABLE public.obra_portal_documents
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'interno',
  ADD COLUMN IF NOT EXISTS allow_download boolean NOT NULL DEFAULT true;

UPDATE public.obra_portal_documents
   SET visibility = CASE WHEN publicado_cliente THEN 'publicado' ELSE 'interno' END
 WHERE visibility = 'interno';

CREATE INDEX IF NOT EXISTS idx_obra_portal_items_obra_kind
  ON public.obra_portal_items(obra_id, kind, visibility, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obra_portal_responses_item
  ON public.obra_portal_item_responses(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obra_portal_audit_obra
  ON public.obra_portal_audit(obra_id, created_at DESC);

ALTER TABLE public.obra_portal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_portal_item_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_portal_audit ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['obra_portal_items','obra_portal_item_responses','obra_portal_audit']
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
