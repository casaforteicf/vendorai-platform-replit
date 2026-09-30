-- Representation-company function support.
-- Keeps the representative's own tenant unrestricted while the represented
-- tenant controls the modules and lead scope exposed through this function.

ALTER TABLE public.tenant_user_functions
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS linked_tenant_id text NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_tenant_code text NULL,
  ADD COLUMN IF NOT EXISTS lead_access_scope text NOT NULL DEFAULT 'assigned',
  ADD COLUMN IF NOT EXISTS representative_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_user_functions_kind_check'
  ) THEN
    ALTER TABLE public.tenant_user_functions
      ADD CONSTRAINT tenant_user_functions_kind_check
      CHECK (kind IN ('internal', 'external_company'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_user_functions_lead_access_scope_check'
  ) THEN
    ALTER TABLE public.tenant_user_functions
      ADD CONSTRAINT tenant_user_functions_lead_access_scope_check
      CHECK (lead_access_scope IN ('assigned', 'territory', 'all_authorized'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_user_functions_representative_user_ids_array'
  ) THEN
    ALTER TABLE public.tenant_user_functions
      ADD CONSTRAINT tenant_user_functions_representative_user_ids_array
      CHECK (jsonb_typeof(representative_user_ids) = 'array');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tenant_user_functions_linked_tenant_idx
  ON public.tenant_user_functions (linked_tenant_id)
  WHERE linked_tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_user_functions_kind_idx
  ON public.tenant_user_functions (tenant_id, kind);
