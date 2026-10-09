CREATE TABLE IF NOT EXISTS public.budget_imports (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  source_type text NOT NULL DEFAULT 'pdf',
  original_name text NOT NULL,
  mime_type text,
  file_url text,
  extraction_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric,
  review_status text NOT NULL DEFAULT 'pending_review',
  created_by text,
  created_at timestamp NOT NULL DEFAULT now(),
  reviewed_at timestamp,
  reviewed_by text
);
CREATE INDEX IF NOT EXISTS budget_imports_tenant_created_idx ON public.budget_imports (tenant_id, created_at DESC);
ALTER TABLE public.budget_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendorai_budget_imports_access ON public.budget_imports;
CREATE POLICY vendorai_budget_imports_access ON public.budget_imports
  FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());