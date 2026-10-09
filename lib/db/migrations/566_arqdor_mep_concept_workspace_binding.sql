-- Explicit tenant-scoped binding between Concept and BIM workspace.
-- No inferred equality of project IDs and no automatic reassignment.
CREATE TABLE IF NOT EXISTS arqdor_mep_project_bindings (
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  concept_project_id text NOT NULL REFERENCES arch_concept_projects(id) ON DELETE CASCADE,
  workspace_project_id text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,concept_project_id),
  UNIQUE (tenant_id,workspace_project_id),
  CONSTRAINT arqdor_mep_binding_workspace_fk FOREIGN KEY (workspace_project_id,tenant_id)
    REFERENCES arqdor_workspace_projects(id,tenant_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS arqdor_mep_binding_workspace_idx ON arqdor_mep_project_bindings(tenant_id,workspace_project_id);
-- A concept project ID is globally unique. The tenant equality of that concept
-- requires a composite unique referenced key; do not trust a plain ID FK alone.
CREATE UNIQUE INDEX IF NOT EXISTS arch_concept_projects_tenant_id_id_uidx ON arch_concept_projects(tenant_id,id);
ALTER TABLE arqdor_mep_project_bindings
  ADD CONSTRAINT arqdor_mep_binding_concept_tenant_fk
  FOREIGN KEY (tenant_id,concept_project_id)
  REFERENCES arch_concept_projects(tenant_id,id) ON DELETE CASCADE;
