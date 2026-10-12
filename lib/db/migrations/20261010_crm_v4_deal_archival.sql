-- CRM V4-01: audited soft archive of deals. Apply in isolated homologation first.
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS archived_at timestamp;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS archived_by text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS archive_reason text;
CREATE INDEX IF NOT EXISTS deals_tenant_active_archive_idx
  ON public.deals (tenant_id, archived_at);
