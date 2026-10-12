-- MULTI-07: project membership ACL, additive migration only.
-- Do not apply to production before tenant/user provenance checks and staging approval.
CREATE TABLE IF NOT EXISTS arqdor_workspace_members (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, project_id, user_id),
  CONSTRAINT arqdor_workspace_members_project_fk
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES arqdor_workspace_projects(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS arqdor_workspace_members_user_idx
  ON arqdor_workspace_members (tenant_id, user_id);
-- Guard membership writes against a user from a different tenant.
-- This is checked when a membership row is inserted or its tenant/user changes.
CREATE OR REPLACE FUNCTION enforce_arqdor_member_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE users.id = NEW.user_id AND users.tenant_id = NEW.tenant_id AND users.active = TRUE
  ) THEN
    RAISE EXCEPTION 'Arqdor member must be an active user in the same tenant'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS arqdor_member_tenant_guard ON arqdor_workspace_members;
CREATE TRIGGER arqdor_member_tenant_guard
BEFORE INSERT OR UPDATE OF tenant_id, user_id
ON arqdor_workspace_members FOR EACH ROW
EXECUTE FUNCTION enforce_arqdor_member_tenant();

-- Deliberately no automatic owner grants/backfill. A tenant admin must verify
-- project provenance before a membership is created.
