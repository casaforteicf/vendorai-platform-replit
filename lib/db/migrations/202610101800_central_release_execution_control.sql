-- CENTRAL-01: persistent execution mode for the existing release worker.
-- Apply through the controlled Supabase migration pipeline before deploying the API.
CREATE TABLE IF NOT EXISTS public.admin_release_execution_control (
  id integer PRIMARY KEY CHECK (id = 1),
  mode text NOT NULL DEFAULT 'paused' CHECK (mode IN ('running','paused','draining')),
  reason text,
  updated_by text NOT NULL DEFAULT 'migration',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.admin_release_execution_control (id, mode, reason, updated_by)
VALUES (1, 'paused', 'Awaiting operator and release gate homologation', 'migration')
ON CONFLICT (id) DO NOTHING;
REVOKE ALL ON public.admin_release_execution_control FROM PUBLIC;
-- Grant only to the runtime role supplied by the migration operator.
-- Execute grants separately once the exact DATABASE_URL role has been verified;
-- never assume postgres, service_role, or another privileged identity is the API role.
