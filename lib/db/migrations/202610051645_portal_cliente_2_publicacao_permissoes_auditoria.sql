-- Portal do Cliente 2.0 — publicação granular, perfis e auditoria

ALTER TABLE public.obra_portal_documents
  ADD COLUMN IF NOT EXISTS publication_state text NOT NULL DEFAULT 'interno',
  ADD COLUMN IF NOT EXISTS allow_download boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visible_roles jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.obra_portal_documents
SET publication_state = CASE WHEN publicado_cliente THEN 'publicado' ELSE 'interno' END
WHERE publication_state = 'interno';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'obra_portal_documents_publication_state_chk'
  ) THEN
    ALTER TABLE public.obra_portal_documents
      ADD CONSTRAINT obra_portal_documents_publication_state_chk
      CHECK (publication_state IN ('interno','compartilhavel','publicado','arquivado'));
  END IF;
END $$;

ALTER TABLE public.obra_portal_users
  ADD COLUMN IF NOT EXISTS role_key text NOT NULL DEFAULT 'proprietario',
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS access_expires_at timestamptz NULL;

CREATE TABLE IF NOT EXISTS public.obra_portal_audit_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  portal_user_id text NULL REFERENCES public.obra_portal_users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  entity_type text NULL,
  entity_id text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obra_portal_audit_obra
  ON public.obra_portal_audit_events(obra_id, created_at DESC);

ALTER TABLE public.obra_portal_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendorai_tenant_access ON public.obra_portal_audit_events;
DROP POLICY IF EXISTS vendorai_tenant_guard ON public.obra_portal_audit_events;

CREATE POLICY vendorai_tenant_access ON public.obra_portal_audit_events
AS PERMISSIVE FOR ALL TO vendorai_app
USING (app_security.is_super_admin() OR tenant_id=app_security.current_tenant_id())
WITH CHECK (app_security.is_super_admin() OR tenant_id=app_security.current_tenant_id());

CREATE POLICY vendorai_tenant_guard ON public.obra_portal_audit_events
AS RESTRICTIVE FOR ALL TO vendorai_app
USING (app_security.is_super_admin() OR tenant_id=app_security.current_tenant_id())
WITH CHECK (app_security.is_super_admin() OR tenant_id=app_security.current_tenant_id());

GRANT SELECT,INSERT,UPDATE,DELETE ON public.obra_portal_audit_events TO vendorai_app;
