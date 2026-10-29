-- VDEV-03: additive multi-tenant project storage. Run in staging first.
CREATE TABLE IF NOT EXISTS public.vendi_studio_projects (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  kind text NOT NULL DEFAULT 'web_app' CHECK (kind IN ('web_app','mobile_app','website','book','ebook','course','agent','design','media','other')),
  brief text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','planning','developing','testing','published','archived')),
  template_id text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS vendi_studio_projects_tenant_updated_idx ON public.vendi_studio_projects (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS vendi_studio_projects_tenant_owner_idx ON public.vendi_studio_projects (tenant_id, owner_user_id);
CREATE INDEX IF NOT EXISTS vendi_studio_projects_tenant_status_idx ON public.vendi_studio_projects (tenant_id, status);
ALTER TABLE public.vendi_studio_projects ENABLE ROW LEVEL SECURITY;
-- This table is accessed only through trusted server-side routes that must
-- derive tenant_id from verified authentication and enforce RBAC.
-- Do not create broad client-side SELECT/INSERT/UPDATE policies here.
