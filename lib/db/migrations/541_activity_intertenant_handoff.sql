-- Activity intertenant handoff: preserve responsibility transfer without creating a second activity engine.
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS handoff_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS handoff_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS handoff_from_tenant_id text,
  ADD COLUMN IF NOT EXISTS handoff_to_tenant_id text,
  ADD COLUMN IF NOT EXISTS handoff_from_user_id text,
  ADD COLUMN IF NOT EXISTS handoff_to_user_id text,
  ADD COLUMN IF NOT EXISTS handoff_from_stage_key text,
  ADD COLUMN IF NOT EXISTS handoff_to_stage_key text,
  ADD COLUMN IF NOT EXISTS handoff_requested_at timestamp,
  ADD COLUMN IF NOT EXISTS handoff_accepted_at timestamp,
  ADD COLUMN IF NOT EXISTS handoff_rejected_at timestamp,
  ADD COLUMN IF NOT EXISTS handoff_rejection_reason text,
  ADD COLUMN IF NOT EXISTS handoff_sla_due_at timestamp;

CREATE INDEX IF NOT EXISTS activities_handoff_target_idx
  ON public.activities (handoff_to_tenant_id, handoff_status, handoff_sla_due_at);

CREATE INDEX IF NOT EXISTS activities_handoff_source_idx
  ON public.activities (handoff_from_tenant_id, handoff_status, handoff_requested_at);
