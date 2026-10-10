-- AGENT-UX: aggregated authenticated error reports; no stack traces or PII.
CREATE TABLE IF NOT EXISTS public.ux_runtime_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  route_key text NOT NULL,
  error_kind text NOT NULL DEFAULT 'react_render',
  occurrences integer NOT NULL DEFAULT 1 CHECK (occurrences > 0),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  bucket_start timestamptz NOT NULL,
  UNIQUE (tenant_id, route_key, error_kind, bucket_start)
);
CREATE INDEX IF NOT EXISTS ux_runtime_errors_recent_idx
  ON public.ux_runtime_errors (tenant_id, last_seen_at DESC);
ALTER TABLE public.ux_runtime_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ux_runtime_errors FROM PUBLIC;
