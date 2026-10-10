-- MEP impact review records; no automatic repositioning.
CREATE TABLE IF NOT EXISTS arqdor_mep_host_reviews (
  id text NOT NULL,
  tenant_id text NOT NULL,
  project_id text NOT NULL,
  node_id text NOT NULL,
  host_element_id text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('removed','modified','floor_changed')),
  status text NOT NULL DEFAULT 'requires_review' CHECK (status IN ('requires_review','resolved','dismissed')),
  concept_project_id text NOT NULL,
  architecture_updated_at timestamp NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  reviewed_at timestamp,
  reviewed_by text,
  PRIMARY KEY(tenant_id,project_id,id),
  CONSTRAINT arqdor_mep_review_workspace_fk FOREIGN KEY(project_id,tenant_id)
    REFERENCES arqdor_workspace_projects(id,tenant_id) ON DELETE CASCADE,
  CONSTRAINT arqdor_mep_review_binding_fk FOREIGN KEY(tenant_id,concept_project_id)
    REFERENCES arqdor_mep_project_bindings(tenant_id,concept_project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS arqdor_mep_host_review_pending_idx
 ON arqdor_mep_host_reviews(tenant_id,project_id,status,created_at);
