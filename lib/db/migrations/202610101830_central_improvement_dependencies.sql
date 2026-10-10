-- CENTRAL-01: explicit dependency graph for the existing improvement queue.
-- Prerequisites must have production validation before work can be claimed.
CREATE TABLE IF NOT EXISTS public.admin_improvement_dependencies (
  improvement_id uuid NOT NULL REFERENCES public.admin_improvements(id) ON DELETE CASCADE,
  depends_on_id uuid NOT NULL REFERENCES public.admin_improvements(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (improvement_id, depends_on_id),
  CONSTRAINT admin_improvement_dependencies_distinct CHECK (improvement_id <> depends_on_id)
);
CREATE INDEX IF NOT EXISTS admin_improvement_dependencies_prerequisite_idx
  ON public.admin_improvement_dependencies(depends_on_id);
REVOKE ALL ON public.admin_improvement_dependencies FROM PUBLIC;
-- Grant only to the runtime role supplied by the migration operator.
-- Execute grants separately once the exact DATABASE_URL role has been verified;
-- never assume postgres, service_role, or another privileged identity is the API role.
