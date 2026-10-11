-- CENTRAL-01: mapping for operational improvements already present in the Central.
-- Does not generate duplicate improvements or assume master records are imported.
CREATE TABLE IF NOT EXISTS public.admin_improvement_master_links (
  lot text NOT NULL CHECK (lot ~ '^[0-9]{2}$'),
  sublot text PRIMARY KEY CHECK (sublot ~ '^[0-9]{2}\.[0-9]{2}$'),
  improvement_id uuid NOT NULL REFERENCES public.admin_improvements(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT master_link_lot_matches CHECK (split_part(sublot,'.',1)=lot)
);
CREATE INDEX IF NOT EXISTS admin_improvement_master_links_improvement_idx
  ON public.admin_improvement_master_links(improvement_id);
REVOKE ALL ON public.admin_improvement_master_links FROM PUBLIC;
